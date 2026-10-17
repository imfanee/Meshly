import { describe, expect, it } from 'vitest';
import { hkdfSha256, deriveRoomKeys } from '../../src/lib/core/crypto/hkdf';
import { seal, open, aadFor } from '../../src/lib/core/crypto/aead';
import {
  generateIdentity,
  importPublicKey,
  peerIdOf,
  signJson,
  verifyJson,
} from '../../src/lib/core/crypto/sign';
import {
  canonicalJson,
  fromHex,
  toHex,
  toBase64Url,
  fromBase64Url,
} from '../../src/lib/core/crypto/encoding';
import { issueTicket, verifyTicket } from '../../src/lib/core/crypto/ticket';
import { randomRoomId, randomSecret } from '../../src/lib/core/room/link';

const hex = (s: string) => fromHex(s);

describe('encoding', () => {
  it('base64url round trips', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(33));
    expect(new Uint8Array(fromBase64Url(toBase64Url(bytes)))).toEqual(bytes);
    expect(toBase64Url(bytes)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });
  it('is stable across runs and preserves unicode', () => {
    const v = { z: 'héllo wörld', a: [3, 2, { b: 'x' }] };
    expect(canonicalJson(v)).toBe(canonicalJson(v));
    expect(canonicalJson(v)).toBe('{"a":[3,2,{"b":"x"}],"z":"héllo wörld"}');
  });
  it('drops undefined object fields and rejects non-finite numbers', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe('hkdf', () => {
  it('matches RFC 5869 test case 1 (SHA-256)', async () => {
    const ikm = new Uint8Array(22).fill(0x0b);
    const salt = hex('000102030405060708090a0b0c');
    const info = hex('f0f1f2f3f4f5f6f7f8f9');
    const okm = await hkdfSha256(ikm, salt, info, 42);
    expect(toHex(okm)).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('derives a 32-hex topic and a usable AES key', async () => {
    const keys = await deriveRoomKeys(randomSecret(), randomRoomId());
    expect(keys.topic).toMatch(/^[0-9a-f]{32}$/);
    expect(keys.encKey.type).toBe('secret');
  });
});

describe('aead (AES-256-GCM)', () => {
  it('round trips and detects tampering', async () => {
    const { encKey, topic } = await deriveRoomKeys(
      randomSecret(),
      randomRoomId(),
    );
    const aad = aadFor(topic);
    const payload = await seal(encKey, aad, '{"hello":"world"}');
    expect(await open(encKey, aad, payload)).toBe('{"hello":"world"}');

    // Flip a ciphertext bit: decrypt must fail.
    const raw = fromBase64Url(payload);
    raw[20] ^= 0x01;
    expect(await open(encKey, aad, toBase64Url(raw))).toBeNull();

    // Wrong AAD must fail too.
    expect(await open(encKey, aadFor('0'.repeat(32)), payload)).toBeNull();
  });
});

describe('sign (ECDSA P-256)', () => {
  it('signs and verifies canonical JSON', async () => {
    const id = await generateIdentity();
    const body = { b: 1, a: 'x' };
    const sig = await signJson(id.privateKey, body);
    expect(await verifyJson(id.publicKey, body, sig)).toBe(true);
    expect(await verifyJson(id.publicKey, { a: 'x', b: 2 }, sig)).toBe(false);
    const other = await generateIdentity();
    expect(await verifyJson(other.publicKey, body, sig)).toBe(false);
  });

  it('thumbprint is stable for the same key and importable', async () => {
    const id = await generateIdentity();
    expect(id.thumb).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const imported = await importPublicKey(id.spki);
    const reexported = await crypto.subtle.exportKey('spki', imported);
    expect(toBase64Url(reexported)).toBe(id.spki);
    // peerId binds identity to the key (12 bytes -> 16 chars).
    expect(await peerIdOf(id.spki)).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });
});

describe('tickets', () => {
  async function fixture() {
    const host = await generateIdentity();
    const guest = await generateIdentity();
    const roomId = randomRoomId();
    const peerId = await peerIdOf(guest.spki);
    const st = await issueTicket(host.privateKey, {
      roomId,
      peerId,
      name: 'Sam',
      role: 'guest',
    });
    return { host, guest, roomId, peerId, st };
  }
  const verify = (
    st: unknown,
    o: Partial<Parameters<typeof verifyTicket>[1]> & {
      roomId: string;
      peerId: string;
      hostSpki: string;
    },
  ) => verifyTicket(st, o);

  it('accepts a valid ticket', async () => {
    const f = await fixture();
    expect(
      await verify(f.st, {
        roomId: f.roomId,
        peerId: f.peerId,
        hostSpki: f.host.spki,
      }),
    ).toBe('valid');
  });

  it('rejects expired tickets', async () => {
    const f = await fixture();
    expect(
      await verify(f.st, {
        roomId: f.roomId,
        peerId: f.peerId,
        hostSpki: f.host.spki,
        now: Date.now() + 13 * 3600 * 1000,
      }),
    ).toBe('expired');
  });

  it('rejects wrong room, wrong peer and kicked', async () => {
    const f = await fixture();
    const base = {
      roomId: f.roomId,
      peerId: f.peerId,
      hostSpki: f.host.spki,
    };
    expect(await verify(f.st, { ...base, roomId: randomRoomId() })).toBe(
      'wrong-room',
    );
    expect(await verify(f.st, { ...base, peerId: 'different-peer-00' })).toBe(
      'wrong-peer',
    );
    expect(await verify(f.st, { ...base, kicked: new Set([f.peerId]) })).toBe(
      'kicked',
    );
  });

  it('rejects a ticket signed by a different host key', async () => {
    const f = await fixture();
    const other = await generateIdentity();
    expect(
      await verify(f.st, {
        roomId: f.roomId,
        peerId: f.peerId,
        hostSpki: other.spki,
      }),
    ).toBe('bad-sig');
  });
});
