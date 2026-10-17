/**
 * Identity keys and signatures, doc 03 sections 1 and 3:
 * ECDSA P-256 / SHA-256, IEEE P1363 signatures (WebCrypto's wire format),
 * peerId and hostThumb = truncated SHA-256 of the SPKI.
 */

import { canonicalJson, toBase64Url, utf8, fromBase64Url } from './encoding';

export interface IdentityKey {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** SPKI, base64url. */
  spki: string;
  /** peerId / hostThumb-style truncated fingerprint, 22 chars. */
  thumb: string;
}

async function thumbOf(spki: ArrayBuffer, bytes: number): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', spki);
  return toBase64Url(hash.slice(0, bytes));
}

/**
 * Generate an ECDSA identity. `extractable` keeps the private key exportable
 * only where persistence is needed (host key store); participants use
 * non-extractable keys.
 */
export async function generateIdentity(
  extractablePrivate = false,
): Promise<IdentityKey> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    extractablePrivate,
    ['sign', 'verify'],
  );
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  return {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    spki: toBase64Url(spki),
    thumb: await thumbOf(spki, 16),
  };
}

/** peerId per doc 03: first 12 bytes of SHA-256(SPKI), base64url. */
export async function peerIdOf(spkiB64: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    fromBase64Url(spkiB64) as BufferSource,
  );
  return toBase64Url(hash.slice(0, 12));
}

export async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    fromBase64Url(spkiB64) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
}

/** Sign the canonical JSON of `value` (any object WITHOUT a sig field). */
export async function signJson(
  privateKey: CryptoKey,
  value: unknown,
): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    utf8(canonicalJson(value)),
  );
  return toBase64Url(sig);
}

export async function verifyJson(
  publicKey: CryptoKey,
  value: unknown,
  sigB64: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64Url(sigB64) as BufferSource,
      utf8(canonicalJson(value)),
    );
  } catch {
    return false;
  }
}
