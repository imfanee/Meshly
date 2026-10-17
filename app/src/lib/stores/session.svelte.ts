/**
 * Session store, doc 02 section 5. Owns the meeting lifecycle: connects the
 * signalling hub, runs membership (knock/admit/state), and exposes reactive
 * state for the routes. Crypto keys and the membership object live in module
 * scope so WebCrypto objects are never proxied by Svelte state.
 */

import type { RoomLink } from '../core/room/link';
import type { RoomState, RosterEntry } from '../core/room/state';
import type { PendingKnock } from '../core/room/membership';
import { Membership } from '../core/room/membership';
import { SignallingHub, makeTransports } from '../core/signalling';
import { joinRoomKeys } from '../core/room/room';
import { loadHostKey } from '../core/room/hostKeyStore';
import { generateIdentity, type IdentityKey } from '../core/crypto/sign';
import { toBase64Url } from '../core/crypto/encoding';
import { config } from '../../config';

export type Phase = 'home' | 'prejoin' | 'lobby' | 'call' | 'ended';
export type Role = 'host' | 'guest';
export type EndReason = 'left' | 'ended' | 'removed' | 'error';
export type LobbyState = 'waiting' | 'host-away' | 'denied' | 'full' | 'locked';

export const session = $state({
  phase: 'prejoin' as Phase,
  role: 'guest' as Role,
  peerId: null as string | null,
  room: null as RoomLink | null,
  link: null as string | null,
  endReason: 'left' as EndReason,
  joinedAt: null as number | null,
  peerCount: 1,
  lobbyState: 'waiting' as LobbyState,
  roster: [] as RosterEntry[],
  knocks: [] as PendingKnock[],
  locked: false,
  signalling: 'connecting' as 'connecting' | 'open' | 'degraded' | 'closed',
});

// Non-reactive internals (CryptoKeys must not be Svelte-proxied).
let identity: IdentityKey | null = null;
let hostIdentity: IdentityKey | null = null; // set by createRoom on Home
let hub: SignallingHub | null = null;
let membership: Membership | null = null;

export function setHostIdentity(id: IdentityKey): void {
  hostIdentity = id;
}

export function enterRoom(room: RoomLink, link: string, role: Role): void {
  session.room = room;
  session.link = link;
  session.role = role;
  session.phase = 'prejoin';
  session.endReason = 'left';
  session.lobbyState = 'waiting';
}

export function leaveRoom(reason: EndReason): void {
  session.phase = 'ended';
  session.endReason = reason;
}

export function resetSession(): void {
  void membership?.leave();
  membership = null;
  void hub?.close();
  hub = null;
  identity = null;
  hostIdentity = null;
  session.phase = 'prejoin';
  session.role = 'guest';
  session.peerId = null;
  session.room = null;
  session.link = null;
  session.endReason = 'left';
  session.joinedAt = null;
  session.peerCount = 1;
  session.lobbyState = 'waiting';
  session.roster = [];
  session.knocks = [];
  session.locked = false;
  session.signalling = 'connecting';
}

async function connectHub(keys: Awaited<ReturnType<typeof joinRoomKeys>>) {
  const room = session.room;
  if (!room || !identity) throw new Error('session: missing room or identity');
  hub = new SignallingHub(
    await makeTransports(),
    keys,
    identity,
    room.hostThumb,
    {
      onMessage: (env, signer) => {
        void membership?.onMessage(env, signer);
      },
      onStatus: (s) => (session.signalling = s),
    },
  );
  await hub.connect(keys.topic);
  session.peerId = hub.peerId;
}

function applyState(st: RoomState): void {
  session.roster = st.roster;
  session.peerCount = st.roster.length;
  session.locked = st.locked;
}

/** Host path: create hub, start state machine, enter the call. */
export async function startHost(name: string): Promise<void> {
  const room = session.room;
  if (!room) return;
  // Prefer the in-memory identity from createRoom; on reload within 24 h,
  // restore the persisted host key so the host keeps hosting.
  if (!hostIdentity) {
    const stored = await loadHostKey(room.roomId).catch(() => null);
    if (stored) {
      const spki = await crypto.subtle.exportKey('spki', stored.publicKey);
      const hash = await crypto.subtle.digest('SHA-256', spki);
      hostIdentity = {
        publicKey: stored.publicKey,
        privateKey: stored.privateKey,
        spki: toBase64Url(spki),
        thumb: toBase64Url(hash.slice(0, 16)),
      };
    }
  }
  // A host without the key cannot host this room (link thumb would not match):
  // fall back to guest behaviour by joining as a guest below.
  if (!hostIdentity) {
    session.role = 'guest';
    await startGuest(name, true);
    return;
  }
  identity = hostIdentity;
  const keys = await joinRoomKeys(room);
  await connectHub(keys);
  membership = new Membership(
    hub as SignallingHub,
    identity,
    room,
    name,
    'host',
    config.maxParticipants,
    eventsFor(),
  );
  await membership.startHost();
  session.phase = 'call';
  session.joinedAt = Date.now();
}

function eventsFor() {
  return {
    onVerdict: (v: LobbyState) => {
      session.lobbyState = v;
    },
    onAdmitted: () => {
      session.phase = 'call';
      session.joinedAt = Date.now();
    },
    onHostPresence: (seen: boolean) => {
      if (
        session.phase === 'lobby' &&
        session.lobbyState === 'waiting' &&
        !seen
      ) {
        session.lobbyState = 'host-away';
      } else if (session.lobbyState === 'host-away' && seen) {
        session.lobbyState = 'waiting';
      }
    },
    onKnocks: (k: PendingKnock[]) => {
      session.knocks = k;
    },
    onState: applyState,
    onLeave: (reason: 'removed' | 'ended') => leaveRoom(reason),
    onError: (msg: string) => console.warn('membership:', msg),
  };
}

/** Guest path: connect and knock until admitted or denied. */
export async function startGuest(
  name: string,
  wantsVideo: boolean,
): Promise<void> {
  const room = session.room;
  if (!room) return;
  identity = await generateIdentity();
  const keys = await joinRoomKeys(room);
  await connectHub(keys);
  membership = new Membership(
    hub as SignallingHub,
    identity,
    room,
    name,
    'guest',
    config.maxParticipants,
    eventsFor(),
  );
  session.phase = 'lobby';
  await membership.knock(wantsVideo);
}

/** Host actions delegate to membership. */
export const hostActions = {
  admit: (peerId: string) => membership?.admit(peerId),
  deny: (peerId: string) => membership?.deny(peerId, 'denied'),
  kick: (peerId: string) => membership?.kickPeer(peerId),
  setLocked: (v: boolean) => membership?.setLocked(v),
};

export async function leaveCall(): Promise<void> {
  await membership?.leave();
  leaveRoom('left');
}

export async function endCall(): Promise<void> {
  await membership?.end();
  leaveRoom('ended');
}
