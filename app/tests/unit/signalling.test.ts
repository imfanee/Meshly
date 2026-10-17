import { describe, expect, it } from 'vitest';
import {
  ReceivePipeline,
  type DropReason,
} from '../../src/lib/core/signalling/envelope';
import { SignallingHub } from '../../src/lib/core/signalling/hub';
import type { SignallingTransport } from '../../src/lib/core/signalling/transport';
import { deriveRoomKeys } from '../../src/lib/core/crypto/hkdf';
import {
  generateIdentity,
  peerIdOf,
  signJson,
} from '../../src/lib/core/crypto/sign';
import { seal, aadFor } from '../../src/lib/core/crypto/aead';
import { canonicalJson, toBase64Url } from '../../src/lib/core/crypto/encoding';
import { randomRoomId, randomSecret } from '../../src/lib/core/room/link';

async function fixture() {
  const roomId = randomRoomId();
  const secret = randomSecret();
  const keys = await deriveRoomKeys(secret, roomId);
  const host = await generateIdentity();
  const guest = await generateIdentity();
  const guestPeer = await peerIdOf(guest.spki);
  const hostPeer = await peerIdOf(host.spki);
  return {
    roomId,
    keys,
    host,
    guest,
    guestPeer,
    hostPeer,
    hostThumb: host.thumb,
  };
}

const NOW = 1_800_000_000_000;

/** Encode a fully valid envelope, with hooks to corrupt it. */
async function goodMsg(
  f: Awaited<ReturnType<typeof fixture>>,
  signer: Awaited<ReturnType<typeof generateIdentity>>,
  overrides: Record<string, unknown> = {},
  to = '*',
) {
  const signerPeer = await peerIdOf(signer.spki);
  const base = {
    v: 1 as const,
    id: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    ts: NOW,
    from: signerPeer,
    to,
    t: 'knock' as const,
    b: { name: 'Sam' },
    pk: signer.spki,
    ...overrides,
  };
  const sig = await signJson(signer.privateKey, base);
  return seal(
    f.keys.encKey,
    aadFor(f.keys.topic),
    canonicalJson({ ...base, sig }),
  );
}

describe('receive pipeline (doc 10)', () => {
  it('accepts a valid signed envelope', async () => {
    const f = await fixture();
    const p = new ReceivePipeline(f.keys, f.hostPeer, f.hostThumb, () => NOW);
    const msg = await goodMsg(f, f.guest);
    const r = await p.receive(msg);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.env.t).toBe('knock');
      expect(r.signer.peerId).toBe(f.guestPeer);
    }
  });

  it('drops oversize, bad decrypt, bad json, bad shape', async () => {
    const f = await fixture();
    const p = new ReceivePipeline(f.keys, f.hostPeer, f.hostThumb, () => NOW);
    const cases: [string, DropReason][] = [
      ['x'.repeat(25 * 1024), 'oversize'],
      [toBase64Url(crypto.getRandomValues(new Uint8Array(64))), 'bad-decrypt'],
    ];
    for (const [payload, reason] of cases) {
      const r = await p.receive(payload);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(reason);
    }
    // Decryptable but not JSON:
    const notJson = await seal(f.keys.encKey, aadFor(f.keys.topic), 'nope{');
    expect(await p.receive(notJson)).toEqual({ ok: false, reason: 'bad-json' });
    // JSON but wrong shape:
    const notEnv = await seal(f.keys.encKey, aadFor(f.keys.topic), '{"a":1}');
    expect(await p.receive(notEnv)).toEqual({ ok: false, reason: 'bad-shape' });
  });

  it('drops wrong-to, self, stale ts and replayed id', async () => {
    const f = await fixture();
    const p = new ReceivePipeline(f.keys, f.hostPeer, f.hostThumb, () => NOW);
    const wrongTo = await goodMsg(f, f.guest, {}, 'someone-else-0000');
    expect(await p.receive(wrongTo)).toEqual({ ok: false, reason: 'wrong-to' });

    const pSelf = new ReceivePipeline(
      f.keys,
      f.guestPeer,
      f.hostThumb,
      () => NOW,
    );
    expect(await pSelf.receive(await goodMsg(f, f.guest))).toEqual({
      ok: false,
      reason: 'self',
    });

    const stale = await goodMsg(f, f.guest, { ts: NOW - 120_000 });
    expect(await p.receive(stale)).toEqual({ ok: false, reason: 'replay-ts' });

    const id = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    const m1 = await goodMsg(f, f.guest, { id });
    const m2 = await goodMsg(f, f.guest, { id });
    expect((await p.receive(m1)).ok).toBe(true);
    expect(await p.receive(m2)).toEqual({ ok: false, reason: 'replay-id' });
  });

  it('drops bad pk, bad sig and wrong signer for host-only types', async () => {
    const f = await fixture();
    const p = new ReceivePipeline(f.keys, f.hostPeer, f.hostThumb, () => NOW);
    const wrongPk = await generateIdentity();
    const badPk = await goodMsg(f, f.guest, { pk: wrongPk.spki });
    expect(await p.receive(badPk)).toEqual({ ok: false, reason: 'bad-pk' });

    // Sign a different body than the envelope carries.
    const gp = await peerIdOf(f.guest.spki);
    const env = {
      v: 1 as const,
      id: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      ts: NOW,
      from: gp,
      to: '*',
      t: 'bye' as const,
      b: {},
      pk: f.guest.spki,
    };
    const sig = await signJson(f.guest.privateKey, { ...env, b: { x: 1 } });
    const badSig = await seal(
      f.keys.encKey,
      aadFor(f.keys.topic),
      canonicalJson({ ...env, sig }),
    );
    expect(await p.receive(badSig)).toEqual({ ok: false, reason: 'bad-sig' });

    // Guest signing a host-only type:
    const admit = await goodMsg(f, f.guest, { t: 'admit', b: {} });
    expect(await p.receive(admit)).toEqual({
      ok: false,
      reason: 'wrong-signer',
    });
    // Host signing admit is fine (pipeline here belongs to a third observer so
    // the host message is not dropped as "self"):
    const pObserver = new ReceivePipeline(
      f.keys,
      'observer-peer-00',
      f.hostThumb,
      () => NOW,
    );
    const hostAdmit = await goodMsg(f, f.host, { t: 'admit', b: {} });
    expect((await pObserver.receive(hostAdmit)).ok).toBe(true);
  });
});

describe('hub fan-out and dedupe', () => {
  function fakeTransport(
    name: 'nostr' | 'mqtt' | 'dev',
  ): SignallingTransport & {
    sent: string[];
    deliver(p: string): void;
  } {
    let cb: (p: string) => void = () => {};
    return {
      name,
      sent: [],
      async connect() {},
      async publish(p) {
        this.sent.push(p);
      },
      onMessage(c) {
        cb = c;
        return () => {};
      },
      status: () => 'open' as const,
      async close() {},
      deliver(p) {
        cb(p);
      },
    };
  }

  it('publishes to every transport and dedupes inbound', async () => {
    const f = await fixture();
    const t1 = fakeTransport('nostr');
    const t2 = fakeTransport('mqtt');
    const got: string[] = [];
    const hub = new SignallingHub(
      [t1, t2],
      f.keys,
      f.guest,
      f.hostThumb,
      { onMessage: (e) => got.push(`${e.from}:${e.t}`) },
      () => NOW,
    );
    await hub.connect(f.keys.topic);
    await hub.send('knock', { name: 'Sam' }, '*', true);
    expect(t1.sent).toHaveLength(1);
    expect(t2.sent).toHaveLength(1);
    expect(t1.sent[0]).toBe(t2.sent[0]);

    // Same ciphertext arriving on both transports delivers once. The inbound
    // message comes from a third identity so it is not dropped as "self".
    const third = await generateIdentity();
    const thirdPeer = await peerIdOf(third.spki);
    const inbound = await goodMsg(f, third, {}, hub.peerId);
    t1.deliver(inbound);
    t2.deliver(inbound);
    await new Promise((r) => setTimeout(r, 50));
    expect(got).toEqual([`${thirdPeer}:knock`]);
  });
});
