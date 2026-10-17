/**
 * SignallingHub, doc 03 section 7: every outgoing message is published to all
 * connected transports; incoming ciphertext is deduped by content hash and fed
 * to the receive pipeline. The room never splits because every client uses
 * every transport.
 */

import type { SignallingTransport, TransportStatus } from './transport';
import { toHex } from '../crypto/encoding';
import { peerIdOf } from '../crypto/sign';
import {
  signEnvelope,
  ReceivePipeline,
  type MessageType,
  type DropReason,
  type Envelope,
} from './envelope';
import type { RoomKeys } from '../crypto/hkdf';
import type { IdentityKey } from '../crypto/sign';

export interface HubEvents {
  /** Verified, decrypted envelope ready for dispatch. */
  onMessage(env: Envelope): void;
  /** Optional observer for tests/debug (drop reasons). */
  onDrop?(reason: DropReason): void;
  onStatus?(status: TransportStatus): void;
}

export class SignallingHub {
  private pipeline: ReceivePipeline;
  private delivered = new Set<string>();
  peerId = '';

  constructor(
    private transports: SignallingTransport[],
    private keys: RoomKeys,
    private identity: IdentityKey,
    private hostThumb: string,
    private events: HubEvents,
    private now?: () => number,
  ) {
    this.pipeline = new ReceivePipeline(keys, '', hostThumb, now);
  }

  /** peerId is derived async (SHA-256), so finish init here. */
  async connect(topic: string): Promise<void> {
    this.peerId = await peerIdOf(this.identity.spki);
    this.pipeline = new ReceivePipeline(
      this.keys,
      this.peerId,
      this.hostThumb,
      this.now,
    );
    const results = await Promise.allSettled(
      this.transports.map((tr) => tr.connect(topic)),
    );
    for (const tr of this.transports) {
      tr.onMessage((payload) => void this.handleInbound(payload));
    }
    const anyOpen = this.transports.some((t) => t.status() === 'open');
    this.events.onStatus?.(anyOpen ? 'open' : 'degraded');
    if (!anyOpen && results.every((r) => r.status === 'rejected')) {
      throw new Error('signalling: no transport connected');
    }
  }

  private async handleInbound(payload: string): Promise<void> {
    // Dedupe identical ciphertext arriving via multiple transports.
    const hash = toHex(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)),
    );
    if (this.delivered.has(hash)) return;
    this.delivered.add(hash);
    if (this.delivered.size > 8192) {
      this.delivered.delete(this.delivered.values().next().value as string);
    }
    const r = await this.pipeline.receive(payload);
    if (r.ok) this.events.onMessage(r.env);
    else this.events.onDrop?.(r.reason);
  }

  /** Sign, encrypt and publish on every transport. */
  async send(
    t: MessageType,
    b: unknown,
    to = '*',
    includePk = false,
  ): Promise<void> {
    const payload = await signEnvelope(
      this.keys,
      this.identity.privateKey,
      { from: this.peerId, to, t, b },
      includePk ? this.identity.spki : undefined,
    );
    await Promise.all(this.transports.map((tr) => tr.publish(payload)));
  }

  rememberPeer(peerId: string, spki: string): void {
    this.pipeline.rememberPeer(peerId, spki);
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.transports.map((t) => t.close()));
  }
}
