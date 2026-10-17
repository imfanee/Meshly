/**
 * MQTT-over-WebSocket transport, doc 03 section 7.2: topic
 * `meshly/v1/<topic>`, QoS 0, clean sessions, no retained messages. Sends are
 * paced because public brokers drop bursts (spike T0.4).
 */

import mqtt, { type MqttClient } from 'mqtt';
import { toBase64Url } from '../crypto/encoding';
import type { SignallingTransport, TransportStatus } from './transport';

const MIN_INTERVAL_MS = 110;

export class MqttTransport implements SignallingTransport {
  readonly name = 'mqtt' as const;
  private clients: MqttClient[] = [];
  private cbs = new Set<(p: string) => void>();
  private state: TransportStatus = 'connecting';
  private queue: Promise<void> = Promise.resolve();
  private mqttTopic = '';
  private clientId = `meshly-${toBase64Url(crypto.getRandomValues(new Uint8Array(9)))}`;

  constructor(private brokers: string[]) {}

  async connect(topic: string): Promise<void> {
    this.mqttTopic = `meshly/v1/${topic}`;
    if (this.brokers.length === 0) {
      this.state = 'closed';
      return;
    }
    const results = await Promise.allSettled(
      this.brokers.map(
        (url) =>
          new Promise<MqttClient>((resolve, reject) => {
            const c = mqtt.connect(url, {
              clientId: `${this.clientId}-${Math.random().toString(36).slice(2, 7)}`,
              clean: true,
              connectTimeout: 12_000,
              reconnectPeriod: 5_000,
              protocolVersion: 4,
            });
            c.once('connect', () => resolve(c));
            c.once('error', (e) => {
              c.end(true);
              reject(e);
            });
          }),
      ),
    );
    this.clients = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const c = r.value;
      c.on('message', (_t, payload) => {
        const s = payload.toString();
        for (const cb of this.cbs) cb(s);
      });
      c.on('error', () => {
        this.state = 'degraded';
      });
      c.on('close', () => {
        this.state = 'degraded';
      });
      try {
        await c.subscribeAsync(this.mqttTopic, { qos: 0 });
        this.clients.push(c);
      } catch {
        c.end(true);
      }
    }
    this.state = this.clients.length ? 'open' : 'degraded';
    if (!this.clients.length) throw new Error('mqtt: no broker connected');
  }

  publish(payload: string): Promise<void> {
    this.queue = this.queue.then(async () => {
      for (const c of this.clients) {
        try {
          await c.publishAsync(this.mqttTopic, payload, { qos: 0 });
        } catch {
          /* broker dropped; others carry it */
        }
      }
      await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
    });
    return this.queue;
  }

  onMessage(cb: (payload: string) => void): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  status(): TransportStatus {
    return this.state;
  }

  async close(): Promise<void> {
    await this.queue.catch(() => undefined);
    for (const c of this.clients) c.end(true);
    this.clients = [];
    this.state = 'closed';
  }
}
