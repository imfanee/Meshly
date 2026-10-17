/**
 * Envelope encryption, doc 03 section 3: AES-256-GCM over
 * base64url(iv(12) || ciphertext+tag) with the room AAD bound to the topic.
 */

import { fromBase64Url, fromUtf8, toBase64Url, utf8 } from './encoding';

export const aadFor = (topic: string): Uint8Array<ArrayBuffer> =>
  utf8(`meshly/v1/${topic}`);

export async function seal(
  encKey: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    encKey,
    utf8(plaintext),
  );
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return toBase64Url(out);
}

/** Decrypt or return null on any failure (tag mismatch, bad encoding). */
export async function open(
  encKey: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  payload: string,
): Promise<string | null> {
  try {
    const raw = fromBase64Url(payload);
    if (raw.length < 12 + 16) return null;
    const ct = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: aad },
      encKey,
      raw.slice(12),
    );
    return fromUtf8(ct);
  } catch {
    return null;
  }
}
