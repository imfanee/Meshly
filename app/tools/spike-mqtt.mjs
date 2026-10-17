#!/usr/bin/env node
/**
 * Meshly T0.4 spike: MQTT over WebSocket broker suitability check.
 *
 * For each candidate broker this opens TWO clients (subscriber + publisher),
 * subscribes `meshly/v1/<probe-topic>` at QoS 0, publishes MESSAGES messages
 * and measures delivery count and latency. QoS 0 has no broker ACK, so
 * "accepted" means the client emitted no publish error.
 *
 * Usage: node tools/spike-mqtt.mjs [broker ...]
 * Results print as a table; paste them into docs/spikes/mqtt.md.
 */
import mqtt from 'mqtt';
import { randomBytes } from 'node:crypto';

const MESSAGES = 20;
const SETTLE_MS = 8_000;
const PUBLISH_GAP_MS = 50;
const CONNECT_TIMEOUT_MS = 12_000;
const BROKER_BUDGET_MS = 35_000;

const CANDIDATES = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://mqtt.eclipseprojects.io:443/mqtt',
  'wss://broker.mqtt.cool:1884/mqtt',
];

const brokers = process.argv.slice(2).length
  ? process.argv.slice(2)
  : CANDIDATES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const median = (xs) =>
  xs.length ? sorted(xs)[Math.floor(xs.length / 2)] : null;
const p95 = (xs) =>
  xs.length
    ? sorted(xs)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)]
    : null;

const clientId = () => `meshly-spike-${randomBytes(8).toString('hex')}`;

function connect(url) {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(url, {
      clientId: clientId(),
      clean: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectPeriod: 0,
      protocolVersion: 4,
    });
    const timer = setTimeout(() => {
      c.end(true);
      reject(new Error('connect timeout'));
    }, CONNECT_TIMEOUT_MS);
    c.once('connect', () => {
      clearTimeout(timer);
      resolve(c);
    });
    c.once('error', (e) => {
      clearTimeout(timer);
      c.end(true);
      reject(e);
    });
  });
}

async function spikeBroker(url) {
  const topic = `meshly/v1/spike-${randomBytes(8).toString('hex')}`;
  const latencies = [];
  const seen = new Set();
  let sub = null;
  let pub = null;
  let pubError = null;

  try {
    sub = await connect(url);
  } catch (e) {
    return {
      url,
      connected: false,
      subscribed: false,
      error: `subscriber: ${e?.message ?? e}`,
      published: 0,
      delivered: 0,
      latencies,
    };
  }

  try {
    sub.on('message', (_t, payload) => {
      try {
        const { i, t0 } = JSON.parse(payload.toString());
        if (seen.has(i)) return;
        seen.add(i);
        latencies.push(Date.now() - t0);
      } catch {
        /* not ours */
      }
    });
    await sub.subscribeAsync(topic, { qos: 0 });
    await sleep(500);

    pub = await connect(url);
    for (let i = 0; i < MESSAGES; i += 1) {
      try {
        await pub.publishAsync(
          topic,
          JSON.stringify({ i, t0: Date.now() }),
          { qos: 0 },
        );
      } catch (e) {
        if (!pubError) pubError = e?.message ?? String(e);
      }
      await sleep(PUBLISH_GAP_MS);
    }

    const deadline = Date.now() + SETTLE_MS;
    while (seen.size < MESSAGES && Date.now() < deadline) {
      await sleep(100);
    }

    return {
      url,
      connected: true,
      subscribed: true,
      error: pubError,
      published: MESSAGES,
      delivered: seen.size,
      latencies,
    };
  } catch (e) {
    return {
      url,
      connected: true,
      subscribed: false,
      error: e?.message ?? String(e),
      published: 0,
      delivered: seen.size,
      latencies,
    };
  } finally {
    try {
      sub?.end(true);
      pub?.end(true);
    } catch {
      /* closing */
    }
  }
}

console.log(
  `Meshly MQTT spike: ${MESSAGES} QoS0 messages per broker, ` +
    `${new Date().toISOString()}\n`,
);
console.log(
  [
    'broker'.padEnd(42),
    'connect'.padEnd(8),
    'delivered'.padEnd(10),
    'med ms'.padEnd(7),
    'p95 ms'.padEnd(7),
    'error',
  ].join('| '),
);
console.log('-'.repeat(100));

for (const url of brokers) {
  process.stderr.write(`probing ${url} ...\n`);
  let r;
  try {
    r = await Promise.race([
      spikeBroker(url),
      sleep(BROKER_BUDGET_MS).then(() => {
        throw new Error('overall timeout');
      }),
    ]);
  } catch (e) {
    r = {
      url,
      connected: false,
      subscribed: false,
      error: String(e?.message ?? e),
      published: 0,
      delivered: 0,
      latencies: [],
    };
  }
  console.log(
    [
      r.url.padEnd(42),
      (r.connected ? 'yes' : 'NO').padEnd(8),
      String(`${r.delivered}/${MESSAGES}`).padEnd(10),
      String(median(r.latencies) ?? 'n/a').padEnd(7),
      String(p95(r.latencies) ?? 'n/a').padEnd(7),
      (r.error ?? '').slice(0, 60),
    ].join('| '),
  );
}

console.log('\nDone. Paste the rows above into docs/spikes/mqtt.md.');
