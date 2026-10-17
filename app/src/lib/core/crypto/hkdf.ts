/**
 * HKDF-SHA256 key derivation per doc 03 section 2, on WebCrypto.
 */

import { fromBase64Url, toHex, utf8 } from './encoding';

export interface RoomKeys {
  /** 32 hex chars: Nostr `t` tag / MQTT topic suffix. Reveals nothing. */
  topic: string;
  /** AES-256-GCM key for the outer envelope encryption. */
  encKey: CryptoKey;
}

async function hkdf(
  ikm: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
}

/** Raw HKDF for tests (RFC 5869 vectors) and unusual callers. */
export const hkdfSha256 = hkdf;

/** Derive the room's shared topic and encryption key from the link secret. */
export async function deriveRoomKeys(
  roomSecret: string,
  roomId: string,
): Promise<RoomKeys> {
  const ikm = fromBase64Url(roomSecret);
  const salt = utf8(`meshly/v1/${roomId}`);
  const topicKey = await hkdf(ikm, salt, utf8('meshly/v1/topic'), 32);
  const encBits = await hkdf(ikm, salt, utf8('meshly/v1/aead'), 32);
  const encKey = await crypto.subtle.importKey(
    'raw',
    encBits,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { topic: toHex(topicKey).slice(0, 32), encKey };
}
