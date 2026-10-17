/**
 * Envelope codec and receive pipeline, doc 03 section 3.
 *
 * Outer: base64url(iv || AES-GCM ciphertext) under the room encKey.
 * Inner: JSON Envelope signed with the sender's ECDSA key (canonical JSON,
 * P1363 signature). The pipeline drops bad input silently and reports why for
 * tests/debug.
 */

import { canonicalJson, fromBase64Url, toBase64Url } from '../crypto/encoding';
import { open, seal, aadFor } from '../crypto/aead';
import {
  importPublicKey,
  peerIdOf,
  signJson,
  verifyJson,
} from '../crypto/sign';
import type { RoomKeys } from '../crypto/hkdf';

export const MAX_OUTER = 24 * 1024;
export const MAX_INNER = 16 * 1024;
const TS_SKEW_MS = 60_000;
const SEEN_MAX = 4096;

export type MessageType =
  | 'knock'
  | 'admit'
  | 'deny'
  | 'host-here'
  | 'hello'
  | 'sdp'
  | 'ice'
  | 'state'
  | 'kick'
  | 'end'
  | 'bye';

const TYPES = new Set<MessageType>([
  'knock',
  'admit',
  'deny',
  'host-here',
  'hello',
  'sdp',
  'ice',
  'state',
  'kick',
  'end',
  'bye',
]);

/** Host-only types must be signed by the room host key (pipeline step 7). */
export const HOST_ONLY = new Set<MessageType>([
  'admit',
  'deny',
  'state',
  'kick',
  'end',
]);

export interface Envelope {
  v: 1;
  id: string;
  ts: number;
  from: string;
  to: string;
  t: MessageType;
  b: unknown;
  pk?: string;
  sig: string;
}

export interface SignedPeer {
  peerId: string;
  spki: string;
}

export type DropReason =
  | 'oversize'
  | 'bad-decrypt'
  | 'bad-json'
  | 'bad-shape'
  | 'wrong-to'
  | 'self'
  | 'replay-ts'
  | 'replay-id'
  | 'bad-pk'
  | 'bad-sig'
  | 'wrong-signer'
  | 'bad-version';

export type Drop = { ok: false; reason: DropReason };
export type Accept = { ok: true; env: Envelope; signer: SignedPeer };
export type ReceiveResult = Accept | Drop;

/** Derive a fresh envelope id (16 random bytes, base64url). */
export const newId = (): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(16)));

export async function encode(keys: RoomKeys, env: Envelope): Promise<string> {
  return seal(keys.encKey, aadFor(keys.topic), canonicalJson(env));
}

export class ReceivePipeline {
  /** LRU of envelope ids already seen. */
  private seen = new Set<string>();
  /** peerId -> spki of known signers (populated from hello/pk fields). */
  private known = new Map<string, string>();

  constructor(
    private keys: RoomKeys,
    private selfPeerId: string,
    private hostThumb: string,
    private now: () => number = () => Date.now(),
  ) {}

  rememberPeer(peerId: string, spki: string): void {
    this.known.set(peerId, spki);
  }

  private static isEnvelope(
    v: unknown,
  ): v is Omit<Envelope, 'sig'> & { sig: unknown } {
    const e = v as Envelope;
    return (
      typeof e === 'object' &&
      e !== null &&
      typeof e.id === 'string' &&
      typeof e.ts === 'number' &&
      typeof e.from === 'string' &&
      typeof e.to === 'string' &&
      TYPES.has(e.t) &&
      'b' in e
    );
  }

  async receive(payload: string): Promise<ReceiveResult> {
    // 1. size + decrypt
    if (payload.length > MAX_OUTER) return { ok: false, reason: 'oversize' };
    const plain = await open(
      this.keys.encKey,
      aadFor(this.keys.topic),
      payload,
    );
    if (plain === null || plain.length > MAX_INNER) {
      return { ok: false, reason: 'bad-decrypt' };
    }
    // 2. JSON + shape
    let raw: unknown;
    try {
      raw = JSON.parse(plain);
    } catch {
      return { ok: false, reason: 'bad-json' };
    }
    if (!ReceivePipeline.isEnvelope(raw) || typeof raw.sig !== 'string') {
      return { ok: false, reason: 'bad-shape' };
    }
    if (raw.v !== 1) return { ok: false, reason: 'bad-version' };
    const env = raw as Envelope;
    // 3. addressing
    if (env.to !== '*' && env.to !== this.selfPeerId) {
      return { ok: false, reason: 'wrong-to' };
    }
    if (env.from === this.selfPeerId) return { ok: false, reason: 'self' };
    // 4. replay protection
    if (Math.abs(this.now() - env.ts) > TS_SKEW_MS) {
      return { ok: false, reason: 'replay-ts' };
    }
    if (this.seen.has(env.id)) return { ok: false, reason: 'replay-id' };
    // 5. sender key resolution: inline pk must hash to from, else known peer
    let spki = env.pk;
    if (spki) {
      if ((await peerIdOf(spki)) !== env.from) {
        return { ok: false, reason: 'bad-pk' };
      }
      this.known.set(env.from, spki);
    } else {
      spki = this.known.get(env.from);
      if (!spki) return { ok: false, reason: 'bad-pk' };
    }
    // 6. signature over canonical JSON minus sig (pk stays signed)
    const { sig, ...unsigned } = env;
    const key = await importPublicKey(spki);
    if (!(await verifyJson(key, unsigned, sig))) {
      return { ok: false, reason: 'bad-sig' };
    }
    // 7. host-only types must come from the host key (thumbprint from link)
    if (HOST_ONLY.has(env.t)) {
      const hostPeerId = await peerIdOf(spki);
      void hostPeerId;
      if ((await this.isHostKey(spki)) !== true) {
        return { ok: false, reason: 'wrong-signer' };
      }
    }
    this.seen.add(env.id);
    if (this.seen.size > SEEN_MAX) {
      this.seen.delete(this.seen.values().next().value as string);
    }
    return { ok: true, env, signer: { peerId: env.from, spki } };
  }

  private hostThumbOf = new Map<string, boolean>();

  private async isHostKey(spki: string): Promise<boolean> {
    let v = this.hostThumbOf.get(spki);
    if (v === undefined) {
      const hash = await crypto.subtle.digest(
        'SHA-256',
        fromBase64Url(spki) as BufferSource,
      );
      v = toBase64Url(hash.slice(0, 16)) === this.hostThumb;
      this.hostThumbOf.set(spki, v);
    }
    return v;
  }
}

/** Sign and wrap a message for sending. */
export async function signEnvelope(
  keys: RoomKeys,
  privateKey: CryptoKey,
  fields: Omit<Envelope, 'v' | 'id' | 'ts' | 'sig'>,
  pk?: string,
  now = Date.now(),
): Promise<string> {
  const base: Omit<Envelope, 'sig'> = {
    v: 1,
    id: newId(),
    ts: now,
    ...fields,
    ...(pk ? { pk } : {}),
  };
  const sig = await signJson(privateKey, base);
  return encode(keys, { ...base, sig });
}
