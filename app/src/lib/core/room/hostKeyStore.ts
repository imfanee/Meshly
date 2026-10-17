/**
 * Host key persistence, doc 03 section 1 and AGENTS.md golden rule 3:
 * the host ECDSA keypair for a room is kept in IndexedDB for 24 h so a host
 * reload keeps hosting, then deleted. Nothing else about the meeting is
 * persisted.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { toBase64Url, fromBase64Url } from '../crypto/encoding';

const DB = 'meshly';
const STORE = 'hostKeys';
const TTL_MS = 24 * 60 * 60 * 1000;

interface StoredHostKey {
  roomId: string;
  spki: string; // base64url public key
  pkcs8: string; // base64url private key (device-local only)
  savedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'roomId' });
    },
  });
  return dbPromise;
}

export async function saveHostKey(
  roomId: string,
  key: { publicKey: CryptoKey; privateKey: CryptoKey },
): Promise<void> {
  const spki = await crypto.subtle.exportKey('spki', key.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', key.privateKey);
  const rec: StoredHostKey = {
    roomId,
    spki: toBase64Url(spki),
    pkcs8: toBase64Url(pkcs8),
    savedAt: Date.now(),
  };
  await (await db()).put(STORE, rec);
}

/** Returns the keypair if stored within 24 h, else null (and prunes). */
export async function loadHostKey(
  roomId: string,
): Promise<CryptoKeyPair | null> {
  const rec = (await (await db()).get(STORE, roomId)) as
    StoredHostKey | undefined;
  if (!rec) return null;
  if (Date.now() - rec.savedAt > TTL_MS) {
    await (await db()).delete(STORE, roomId);
    return null;
  }
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey(
      'spki',
      fromBase64Url(rec.spki) as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    ),
    crypto.subtle.importKey(
      'pkcs8',
      fromBase64Url(rec.pkcs8) as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    ),
  ]);
  return { publicKey, privateKey };
}

export async function deleteHostKey(roomId: string): Promise<void> {
  await (await db()).delete(STORE, roomId);
}
