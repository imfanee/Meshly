/**
 * Byte/string codecs shared across crypto and room modules, plus canonical
 * JSON used for every signature (doc 03 section 3).
 */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const te = new TextEncoder();
const td = new TextDecoder();

export const utf8 = (s: string): Uint8Array<ArrayBuffer> =>
  te.encode(s) as Uint8Array<ArrayBuffer>;
export const fromUtf8 = (b: Uint8Array | ArrayBuffer): string =>
  td.decode(b instanceof Uint8Array ? b : new Uint8Array(b));

export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return u8;
}

export function toHex(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error('bad hex');
  }
  const u8 = new Uint8Array(hex.length / 2);
  for (let i = 0; i < u8.length; i += 1) {
    u8[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return u8;
}

export function toBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out || '1';
}

/**
 * Canonical JSON: keys sorted lexicographically at every level, no
 * whitespace, UTF-8. Numbers must be finite; undefined/functions/symbols in
 * objects are dropped (JSON semantics), and BigInt/NaN/Infinity throw because
 * they would destroy signature determinism.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('canonicalJson: non-finite');
    return v;
  }
  if (Array.isArray(v)) return v.map(sortValue);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const item = (v as Record<string, unknown>)[k];
      if (item === undefined || typeof item === 'function') continue;
      out[k] = sortValue(item);
    }
    return out;
  }
  throw new TypeError(`canonicalJson: unsupported ${typeof v}`);
}
