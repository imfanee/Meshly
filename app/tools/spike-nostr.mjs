#!/usr/bin/env node
/**
 * Meshly T0.3 spike: Nostr relay suitability check.
 *
 * For each candidate relay this opens TWO connections (one subscription, one
 * publisher, via two SimplePool instances), publishes MESSAGES kind-25050
 * ephemeral events tagged with a unique "t" topic, and measures:
 *
 *   - connect:   whether the relay accepted a WebSocket subscription
 *   - accepted:  events the relay ACKed with OK out of MESSAGES
 *   - delivered: events that came back over the second connection
 *   - latency:   ms from publish to receipt (median / p95)
 *
 * Usage: node tools/spike-nostr.mjs [relay ...]
 * Defaults to the built-in candidate list. Results print as a table; paste
 * them into docs/spikes/nostr.md.
 */
import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from 'nostr-tools';
import { randomBytes } from 'node:crypto';

const KIND = 25050;
const MESSAGES = 20;
const SETTLE_MS = 8_000;
const PUBLISH_GAP_MS = 50;
const RELAY_BUDGET_MS = 35_000;

const CANDIDATES = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://nostr.mom',
  'wss://relay.nostr.bg',
  'wss://nostr.oxtr.dev',
  'wss://offchain.pub',
];

const relays = process.argv.slice(2).length
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

async function spikeRelay(url) {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const topic = `meshly-spike-${randomBytes(8).toString('hex')}`;
  const subPool = new SimplePool();
  const pubPool = new SimplePool();
  const sent = new Map(); // event id -> sent timestamp (ms)
  const acks = []; // Promise<boolean>, one per publish
  const seen = new Set();
  const latencies = [];
  let eosed = false;
  let pubError = null;
  let closeError = null;
  let connected = false;

  try {
    const sub = subPool.subscribeMany(
      [url],
      {
        kinds: [KIND],
        '#t': [topic],
        since: Math.floor(Date.now() / 1000) - 30,
      },
      {
        onevent(ev) {
          if (seen.has(ev.id)) return;
          seen.add(ev.id);
          const t0 = sent.get(ev.id);
          if (t0 !== undefined) latencies.push(Date.now() - t0);
        },
        oneose() {
          eosed = true;
          connected = true;
        },
        onclose(reasons) {
          if (reasons.length && !connected) {
            closeError = reasons.map(String).join('; ');
          }
        },
      },
    );

    // Let the REQ reach the relay before publishing.
    await sleep(1_000);

    for (let i = 0; i < MESSAGES; i += 1) {
      const ev = finalizeEvent(
        {
          kind: KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['t', topic]],
          content: JSON.stringify({ i, probe: topic }),
          pubkey: pk,
        },
        sk,
      );
      sent.set(ev.id, Date.now());
      acks.push(
        Promise.all(pubPool.publish([url], ev))
          .then(() => true)
          .catch((err) => {
            const msg =
              err instanceof Error
                ? err.message
                : typeof err === 'object'
                  ? JSON.stringify(err)
                  : String(err);
            if (!pubError) pubError = `publish: ${msg}`;
            return false;
          }),
      );
      await sleep(PUBLISH_GAP_MS);
    }

    const deadline = Date.now() + SETTLE_MS;
    while (seen.size < MESSAGES && Date.now() < deadline) {
      await sleep(100);
    }
    sub.close();

    const accepted = (await Promise.all(acks)).filter(Boolean).length;
    return {
      url,
      connected: connected || seen.size > 0 || accepted > 0,
      eosed,
      subError: pubError ?? closeError,
      accepted,
      delivered: seen.size,
      latencies,
    };
  } finally {
    subPool.destroy();
    pubPool.destroy();
  }
}

function printRow(r) {
  console.log(
    [
      r.url.padEnd(30),
      (r.connected ? 'yes' : 'NO').padEnd(8),
      String(`${r.accepted}/${MESSAGES}`).padEnd(9),
      String(`${r.delivered}/${MESSAGES}`).padEnd(10),
      String(median(r.latencies) ?? 'n/a').padEnd(7),
      String(p95(r.latencies) ?? 'n/a').padEnd(7),
      (r.subError ?? '').slice(0, 60),
    ].join('| '),
  );
}

console.log(
  `Meshly Nostr spike: kind ${KIND}, ${MESSAGES} events per relay, ` +
    `${new Date().toISOString()}\n`,
);

const results = [];
for (const url of relays) {
  process.stderr.write(`probing ${url} ...\n`);
  try {
    const r = await Promise.race([
      spikeRelay(url),
      sleep(RELAY_BUDGET_MS).then(() => {
        throw new Error('overall timeout');
      }),
    ]);
    results.push(r);
  } catch (e) {
    results.push({
      url,
      connected: false,
      eosed: false,
      subError: String(e?.message ?? e),
      accepted: 0,
      delivered: 0,
      latencies: [],
    });
  }
  printRow(results[results.length - 1]);
}

console.log('\nDone. Paste the rows above into docs/spikes/nostr.md.');
