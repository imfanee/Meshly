import { describe, expect, it, vi } from 'vitest';
import { Membership } from '../../src/lib/core/room/membership';
import { SignallingHub } from '../../src/lib/core/signalling/hub';
import type { SignallingTransport } from '../../src/lib/core/signalling/transport';
import { deriveRoomKeys } from '../../src/lib/core/crypto/hkdf';
import { generateIdentity } from '../../src/lib/core/crypto/sign';
import { randomRoomId, randomSecret } from '../../src/lib/core/room/link';

/** In-memory transport wired peer-to-peer: publish calls the partner's cb. */
function busPair() {
  let aCb: (p: string) => void = () => {};
  let bCb: (p: string) => void = () => {};
  const mk = (
    name: 'dev' | 'nostr' | 'mqtt',
    send: (p: string) => void,
    sub: (c: (p: string) => void) => void,
  ): SignallingTransport => ({
    name,
    connect: async () => {},
    publish: async (p) => send(p),
    onMessage: (c) => {
      sub(c);
      return () => {};
    },
    status: () => 'open',
    close: async () => {},
  });
  const aT = mk(
    'dev',
    (p) => setTimeout(() => bCb(p), 0),
    (c) => (aCb = c),
  );
  const bT = mk(
    'dev',
    (p) => setTimeout(() => aCb(p), 0),
    (c) => (bCb = c),
  );
  return { aT, bT };
}

const flush = () => new Promise((r) => setTimeout(r, 30));

async function setup(maxParticipants = 12) {
  const roomId = randomRoomId();
  const secret = randomSecret();
  const keys = await deriveRoomKeys(secret, roomId);
  const hostId = await generateIdentity();
  const guestId = await generateIdentity();
  const room = { roomId, roomSecret: secret, hostThumb: hostId.thumb };

  const { aT, bT } = busPair();
  const guestEvents = {
    verdicts: [] as string[],
    admitted: false,
    left: null as string | null,
  };
  const hostHub = new SignallingHub([aT], keys, hostId, hostId.thumb, {
    onMessage: (e, s) => void hostM.onMessage(e, s),
  });
  const guestHub = new SignallingHub([bT], keys, guestId, hostId.thumb, {
    onMessage: (e, s) => void guestM.onMessage(e, s),
  });
  await hostHub.connect(keys.topic);
  await guestHub.connect(keys.topic);

  const knocks: { peerId: string; name: string }[] = [];
  const hostM = new Membership(
    hostHub,
    hostId,
    room,
    'Host',
    'host',
    maxParticipants,
    {
      onKnocks: (k) => knocks.splice(0, knocks.length, ...k),
    },
  );
  const guestM = new Membership(
    guestHub,
    guestId,
    room,
    'Guest',
    'guest',
    maxParticipants,
    {
      onVerdict: (v) => guestEvents.verdicts.push(v),
      onAdmitted: () => (guestEvents.admitted = true),
      onLeave: (r) => (guestEvents.left = r),
    },
  );
  await hostM.startHost();
  return { hostM, guestM, guestEvents, knocks, hostHub, guestHub };
}

describe('membership (doc 10: admission)', () => {
  it('knock -> admit -> hello lands the guest in the call', async () => {
    const f = await setup();
    await f.guestM.knock(true);
    await flush();
    expect(f.knocks.map((k) => k.name)).toEqual(['Guest']);
    await f.hostM.admit(f.knocks[0].peerId);
    await flush();
    await vi.waitFor(() => expect(f.guestEvents.admitted).toBe(true));
    expect(f.guestM.roomState?.roster).toHaveLength(2);
  });

  it('deny tells the guest they were denied', async () => {
    const f = await setup();
    await f.guestM.knock(false);
    await flush();
    await f.hostM.deny(f.knocks[0].peerId, 'denied');
    await vi.waitFor(() => expect(f.guestEvents.verdicts).toEqual(['denied']));
  });

  it('locked room denies knockers as locked', async () => {
    const f = await setup();
    await f.hostM.setLocked(true);
    await f.guestM.knock(false);
    await vi.waitFor(() => expect(f.guestEvents.verdicts).toEqual(['locked']));
  });

  it('full room denies knockers as full', async () => {
    const f = await setup(1); // host alone fills the room
    await f.guestM.knock(false);
    await vi.waitFor(() => expect(f.guestEvents.verdicts).toEqual(['full']));
  });

  it('kick removes the peer and tells them', async () => {
    const f = await setup();
    await f.guestM.knock(true);
    await flush();
    await f.hostM.admit(f.knocks[0].peerId);
    await vi.waitFor(() => expect(f.guestEvents.admitted).toBe(true));
    const guestPeerId = f.guestM.roomState?.roster.find(
      (r) => r.role === 'guest',
    )?.peerId;
    await f.hostM.kickPeer(guestPeerId!);
    await vi.waitFor(() => expect(f.guestEvents.left).toBe('removed'));
  });

  it('host end tells everyone', async () => {
    const f = await setup();
    await f.guestM.knock(true);
    await flush();
    await f.hostM.admit(f.knocks[0].peerId);
    await vi.waitFor(() => expect(f.guestEvents.admitted).toBe(true));
    await f.hostM.end();
    await vi.waitFor(() => expect(f.guestEvents.left).toBe('ended'));
  });
});
