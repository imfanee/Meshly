/**
 * Room link encode/decode, doc 03 section 1.
 *
 * Link shape: `https://<host>/r/<roomId>#<roomSecret>.<hostThumb>`
 * The fragment never reaches any server. `roomSecret` is 16 random bytes in
 * base64url; `hostThumb` is the first 16 bytes of SHA-256(host SPKI) in
 * base64url, produced by core/crypto in T1.3.
 */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ROOM_PATH = /^\/r\/([1-9A-HJ-NP-Za-km-z]{10})$/;
const FRAGMENT = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;

export interface RoomLink {
  roomId: string;
  roomSecret: string;
  hostThumb: string;
}

const bytesToBase58 = (bytes: Uint8Array): string => {
  // roomId uses 8 random bytes -> 10 or 11 base58 chars; take the first 10.
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out.padStart(10, '1').slice(-10);
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

export const randomRoomId = (): string =>
  bytesToBase58(crypto.getRandomValues(new Uint8Array(8)));

export const randomSecret = (): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));

export const formatLink = (
  appUrl: string,
  { roomId, roomSecret, hostThumb }: RoomLink,
): string =>
  `${appUrl.replace(/\/$/, '')}/r/${roomId}#${roomSecret}.${hostThumb}`;

/** Parse `?` and `#` fragments of a Meshly room URL or bare `/r/...` path. */
export const parseLink = (input: string): RoomLink | null => {
  let path: string;
  let hash: string;
  try {
    const url = new URL(input, 'https://placeholder.local');
    path = url.pathname;
    hash = url.hash.slice(1);
  } catch {
    return null;
  }
  const room = ROOM_PATH.exec(path);
  const frag = FRAGMENT.exec(hash);
  if (!room || !frag) return null;
  return { roomId: room[1], roomSecret: frag[1], hostThumb: frag[2] };
};

/** True when the path looks like a room link but the fragment is unusable. */
export const isIncompleteLink = (path: string, hash: string): boolean =>
  ROOM_PATH.test(path) && !FRAGMENT.test(hash.replace(/^#/, ''));
