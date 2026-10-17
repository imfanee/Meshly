/**
 * Nostr transport, doc 03 section 7.1: kind-25050 ephemeral events tagged
 * with the room topic. A throwaway Nostr key is used purely so relays accept
 * events; app identity is the ECDSA layer inside the envelope.
 */

import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from 'nostr-tools';
import type { SignallingTransport, TransportStatus } from './transport';

const KIND = 25050;
const MIN_INTERVAL_MS = 110; // ~9 msgs/s, under the 10/s doc budget

export class NostrTransport implements SignallingTransport {
  readonly name = 'nostr' as const;
  private pool = new SimplePool();
  private sk = generateSecretKey();
  private pk = getPublicKey(this.sk);
  private sub: { close(): void } | null = null;
  private cbs = new Set<(p: string) => void>();
  private state: TransportStatus = 'connecting';
  private queue: Promise<void> = Promise.resolve();
  private topic = '';

  constructor(private relays: string[]) {}

  async connect(topic: string): Promise<void> {
    this.topic = topic;
    if (this.relays.length === 0) {
      this.state = 'closed';
      return;
    }
    try {
      this.sub = this.pool.subscribeMany(
        this.relays,
        {
          kinds: [KIND],
          '#t': [topic],
          since: Math.floor(Date.now() / 1000) - 30,
        },
        {
          onevent: (ev) => {
            if (ev.pubkey !== this.pk) {
              for (const cb of this.cbs) cb(ev.content);
            }
          },
        },
      );
      this.state = 'open';
    } catch {
      this.state = 'degraded';
    }
  }

  publish(payload: string): Promise<void> {
    // Pace sends: relays rate-limit bursts (spike T0.3).
    this.queue = this.queue.then(async () => {
      const ev = finalizeEvent(
        {
          kind: KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['t', this.topic]],
          content: payload,
        },
        this.sk,
      );
      try {
        await Promise.allSettled(this.pool.publish(this.relays, ev));
      } catch {
        this.state = 'degraded';
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
    this.sub?.close();
    this.pool.destroy();
    this.state = 'closed';
  }
}
