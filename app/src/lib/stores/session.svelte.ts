/**
 * Session store, doc 02 section 5. Owns the meeting lifecycle: connects the
 * signalling hub, runs membership (knock/admit/state), and exposes reactive
 * state for the routes. Crypto keys and the membership object live in module
 * scope so WebCrypto objects are never proxied by Svelte state.
 */

import type { RoomLink } from '../core/room/link';
import type { RoomState, RosterEntry } from '../core/room/state';
import type { PendingKnock } from '../core/room/membership';
import type { Envelope } from '../core/signalling/envelope';
import type { TransferState } from '../core/files/fileTransfer';
import type { ChatMsg as AiChatMsg } from '../core/ai/openaiCompat';
import type { NotesPipeline, TranscribeFn } from '../core/ai/pipeline';
import { activeSpeaker } from '../core/media/activeSpeaker';
import { Membership } from '../core/room/membership';
import { SignallingHub, makeTransports } from '../core/signalling';
import { joinRoomKeys } from '../core/room/room';
import { loadHostKey } from '../core/room/hostKeyStore';
import { generateIdentity, type IdentityKey } from '../core/crypto/sign';
import { toBase64Url } from '../core/crypto/encoding';
import {
  PeerManager,
  type PeerInfo,
  type CtlMessage,
} from '../core/webrtc/peerManager';
import { localMedia } from '../core/media/localMedia';
import { turnCredentials } from '../core/webrtc/turn';
import { settings } from './settings.svelte';
import { toast } from './ui.svelte';
import { config } from '../../config';

export type Phase = 'home' | 'prejoin' | 'lobby' | 'call' | 'ended';
export type Role = 'host' | 'guest';
export type EndReason = 'left' | 'ended' | 'removed' | 'error';
export type LobbyState = 'waiting' | 'host-away' | 'denied' | 'full' | 'locked';

export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
  self: boolean;
}

export interface Reaction {
  id: string;
  name: string;
  emoji: string;
  ts: number;
}

const REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉', '🙏', '😢'] as const;
export const REACTION_SET = [...REACTIONS];

/** Deduped ctl message ids (chat, react, media). */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive dedupe set
const seenCtl = new Set<string>();

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
  peers: [] as PeerInfo[],
  announce: '',
  drops: [] as string[],
  chat: [] as ChatMsg[],
  reactions: [] as Reaction[],
  handUp: false,
  /** Host asked me to mute; show the consent banner. */
  muteAsk: false,
  /** In-flight file transfers (doc 06 s.2). */
  files: [] as TransferState[],
  /** Host is recording this meeting locally. */
  recording: false,
  /** peerId of the participant running AI notes (doc 06 s.6). */
  noteTaker: '',
  /** Consent ask I must answer (who requested, deadline). */
  notesAsk: null as {
    fromId: string;
    fromName: string;
    deadline: number;
  } | null,
  /** My consent decision for the current asker. */
  notesConsent: null as boolean | null,
  /** Attributed transcript lines (note-taker only, doc 06 s.6). */
  transcript: [] as { speaker: string; ts: number; text: string }[],
  /** Running bullet notes + final summary text. */
  notesText: '',
  notesBusy: false,
  /** Notes Markdown shared by the note-taker (recipient side). */
  sharedNotes: null as { fromName: string; md: string } | null,
});

// Non-reactive internals (CryptoKeys must not be Svelte-proxied).
let identity: IdentityKey | null = null;
let hostIdentity: IdentityKey | null = null; // set by createRoom on Home
let hub: SignallingHub | null = null;
let membership: Membership | null = null;
let peerManager: PeerManager | null = null;
/** sdp/ice from peers whose ticket has not been verified yet (hello racing). */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- deliberately non-reactive
const pendingSignals = new Map<string, Envelope[]>();

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
  peerManager?.dispose();
  peerManager = null;
  localMedia.stopAll();
  pendingSignals.clear();
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
  session.peers = [];
  session.announce = '';
  session.chat = [];
  session.reactions = [];
  session.drops = [];
  seenCtl.clear();
  session.handUp = false;
  session.muteAsk = false;
  session.files = [];
  fileBlobs.clear();
  _files = null;
  _recorder = null;
  session.recording = false;
  session.noteTaker = '';
  session.notesAsk = null;
  session.notesConsent = null;
  session.transcript = [];
  session.notesText = '';
  session.notesBusy = false;
  session.sharedNotes = null;
  notesAllowed.clear();
  if (notesTimer) clearInterval(notesTimer);
  notesTimer = null;
  pipeline?.dispose();
  pipeline = null;
  lastNotesLen = 0;
  stopComposite();
  slotGranted = false;
  pendingSlot = false;
  grantedSlots.clear();
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
        if (env.t === 'sdp' || env.t === 'ice') {
          // Doc 03 s.5: media signalling only after ticket verification. The
          // offer can arrive before our hello check finishes, so buffer.
          if (membership?.isVerified(env.from) || peerManager?.has(env.from)) {
            void peerManager?.handleSignal(env).catch((e) => {
              session.drops.push(`sig:${String(e).slice(0, 120)}`);
            });
          } else {
            const list = pendingSignals.get(env.from) ?? [];
            if (list.length < 50) list.push(env);
            pendingSignals.set(env.from, list);
          }
          return;
        }
        void membership?.onMessage(env, signer);
      },
      onStatus: (s) => (session.signalling = s),
      onDrop: (r) => session.drops.push(r),
    },
  );
  await hub.connect(keys.topic);
  session.peerId = hub.peerId;
}

async function initPeerManager(): Promise<PeerManager> {
  if (!hub || !session.peerId) throw new Error('session: hub not ready');
  peerManager?.dispose();
  let relayServers: RTCIceServer[] = [];
  if (settings.relayOnly) {
    // Relay-only joins need TURN credentials up front; refuse otherwise
    // rather than leaking the local IP (doc 04 s.4).
    const creds = await turnCredentials.get();
    if (!creds) {
      throw new Error(
        'Relay-only mode needs the TURN relay, which is unavailable right now.',
      );
    }
    relayServers = creds.iceServers;
  }
  const pm = new PeerManager(hub, session.peerId, localMedia, {
    onPeersChanged: (peers) => (session.peers = peers),
    onPeerJoined: (id) => {
      const name =
        session.roster.find((r) => r.peerId === id)?.name ?? 'Someone';
      session.announce = `${name} joined`;
    },
    onPeerLeft: (id) => {
      const name =
        session.roster.find((r) => r.peerId === id)?.name ?? 'Someone';
      session.announce = `${name} left`;
    },
    onCtl: (peerId, msg) => handleCtl(peerId, msg),
    onDataChannel: (peerId, ch) => {
      // The transfer module lazy-loads; queue frames until it is ready so
      // no chunks are dropped between channel open and handler attach.
      const queue: MessageEvent[] = [];
      ch.onmessage = (e) => queue.push(e);
      void initFiles().then((ft) => {
        if (!ft) return;
        ft.onDataChannel(peerId, ch);
        const handler = ch.onmessage;
        for (const e of queue) handler?.call(ch, e);
      });
    },
  });
  if (relayServers.length) pm.enableRelayOnly(relayServers);
  peerManager = pm;
  void pm.acquireWakeLock();
  pm.startStats();
  return pm;
}

function nameOf(peerId: string): string {
  return session.roster.find((r) => r.peerId === peerId)?.name ?? 'Someone';
}

function handleCtl(peerId: string, msg: CtlMessage): void {
  if (typeof msg.id !== 'string' || typeof msg.t !== 'string') return;
  if (seenCtl.has(msg.id)) return; // dedupe
  if (seenCtl.size > 2000) seenCtl.clear();
  seenCtl.add(msg.id);
  const b = msg.b as Record<string, unknown> | undefined;
  if (msg.t === 'chat' && typeof b?.text === 'string') {
    session.chat.push({
      id: msg.id,
      from: peerId,
      name: nameOf(peerId),
      text: b.text.slice(0, 2000),
      ts: typeof msg.ts === 'number' ? msg.ts : Date.now(),
      self: false,
    });
    session.announce = `${nameOf(peerId)}: ${String(b.text).slice(0, 120)}`;
  } else if (msg.t === 'react' && typeof b?.emoji === 'string') {
    if (!(REACTION_SET as readonly string[]).includes(b.emoji)) return;
    session.reactions.push({
      id: msg.id,
      name: nameOf(peerId),
      emoji: b.emoji,
      ts: Date.now(),
    });
    session.announce = `${nameOf(peerId)} reacted ${b.emoji}`;
  } else if (
    msg.t === 'share-req' ||
    msg.t === 'share-ok' ||
    msg.t === 'share-busy'
  ) {
    handleShareCtl(peerId, msg);
  } else if (msg.t === 'mute-req' && peerId === hostPeerId()) {
    // Only the host may ask; consent is required, never remote-mute.
    session.muteAsk = true;
  } else if (msg.t === 'lower-hand' && peerId === hostPeerId()) {
    setHand(false);
  } else if (msg.t === 'slot-req' && session.role === 'host') {
    // First come, first served while a slot is free (doc 06 s.4).
    const free = videoSenderCount() < config.maxVideo;
    if (free) grantedSlots.add(peerId);
    peerManager?.sendCtlTo(peerId, {
      t: free ? 'slot-ok' : 'slot-deny',
      id: msg.id,
      ts: Date.now(),
      b: {},
    });
  } else if (msg.t === 'slot-ok' && pendingSlot && peerId === hostPeerId()) {
    pendingSlot = false;
    slotGranted = true;
    void mediaActions.setCam(true);
  } else if (msg.t === 'slot-deny' && pendingSlot && peerId === hostPeerId()) {
    pendingSlot = false;
    toast('No free camera slots right now');
  } else if (msg.t === 'notes-req') {
    // Someone started AI notes; I have 30 s to allow or decline.
    if (session.notesAsk?.fromId === peerId) return;
    session.noteTaker = peerId;
    session.notesConsent = null;
    session.notesAsk = {
      fromId: peerId,
      fromName: nameOf(peerId),
      deadline: Date.now() + 30_000,
    };
    setTimeout(() => {
      if (
        session.notesAsk?.fromId === peerId &&
        session.notesConsent === null
      ) {
        answerNotesConsent(false); // timeout counts as decline
      }
    }, 30_000);
  } else if (
    msg.t === 'notes-consent' &&
    session.noteTaker === session.peerId
  ) {
    // I am the note-taker: record the answer.
    const allow = (msg.b as { allow?: boolean } | undefined)?.allow === true;
    if (allow) {
      notesAllowed.add(peerId);
      void ensurePipeline().then(() => addConsentedTrack(peerId));
    } else {
      notesAllowed.delete(peerId);
      pipeline?.removeTrack(peerId);
    }
    session.announce = `${nameOf(peerId)} ${allow ? 'allowed' : 'declined'} AI notes`;
  } else if (msg.t === 'notes-share') {
    // The note-taker shared the finished notes (doc 06 s.6).
    const md = (msg.b as { md?: string } | undefined)?.md;
    if (md) {
      session.sharedNotes = { fromName: nameOf(peerId), md };
      session.announce = `${nameOf(peerId)} shared meeting notes`;
    }
  } else if (msg.t === 'notes-off') {
    session.noteTaker = '';
    session.notesAsk = null;
    notesAllowed.clear();
  } else if (msg.t.startsWith('file-')) {
    void initFiles().then((ft) =>
      ft?.onCtl(peerId, msg as { t: string; b?: Record<string, unknown> }),
    );
  } else if (msg.t === 'slot-revoke' && peerId === hostPeerId()) {
    // Host reassigned the slot; camera off without consent needed.
    slotGranted = false;
    void mediaActions.setCam(false);
    toast('The host reassigned your camera slot');
    session.announce = 'The host turned off your camera';
  }
}

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- host-side set
const grantedSlots = new Set<string>();

function hostPeerId(): string | null {
  return session.roster.find((r) => r.role === 'host')?.peerId ?? null;
}

/** Remote stream lookup for tiles (unproxied MediaStream). */
export function peerStreamOf(peerId: string): MediaStream | null {
  return peerManager?.streamOf(peerId) ?? null;
}

/** Debug accessor for e2e/diagnostics (not part of the UI contract). */
export function debugPeers(): {
  peerId: string;
  signaling: string;
  conn: string;
  ice: string;
  transceivers: number;
  senders: (string | null)[];
  dirs: string[];
}[] {
  if (!peerManager) return [];
  return [
    ...(
      peerManager as unknown as {
        peers: Map<string, { pc: RTCPeerConnection; peerId: string }>;
      }
    ).peers.values(),
  ].map((p) => ({
    peerId: p.peerId,
    signaling: p.pc.signalingState,
    conn: p.pc.connectionState,
    ice: p.pc.iceConnectionState,
    transceivers: p.pc.getTransceivers().length,
    senders: p.pc.getTransceivers().map((t) => t.sender.track?.kind ?? null),
    dirs: p.pc.getTransceivers().map((t) => t.direction),
  }));
}

function applyState(st: RoomState): void {
  session.roster = st.roster;
  session.peerCount = st.roster.length;
  session.locked = st.locked;
  peerManager?.reconcile(st.roster);
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
  let pm: PeerManager;
  try {
    pm = await initPeerManager();
  } catch (e) {
    await leaveRoom('error');
    throw e;
  }
  session.phase = 'call';
  session.joinedAt = Date.now();
  await localMedia.acquire(settings.micOn, settings.camOn).catch(() => null);
  await pm.applyLocalTracks();
}

function eventsFor() {
  return {
    onVerdict: (v: LobbyState) => {
      session.lobbyState = v;
    },
    onAdmitted: () => {
      void (async () => {
        const roster = membership?.roomState?.roster ?? [];
        let pm: PeerManager;
        try {
          pm = await initPeerManager();
        } catch (e) {
          toast(String(e instanceof Error ? e.message : e));
          leaveRoom('error');
          return;
        }
        session.phase = 'call';
        session.joinedAt = Date.now();
        void localMedia
          .acquire(settings.micOn, settings.camOn)
          .catch(() => null)
          .then(() => pm.offerToAll(roster));
      })();
    },
    onPeerVerified: (peerId: string) => {
      void peerManager
        ?.ensurePeer(peerId)
        .then(() => peerManager?.applyLocalTracks())
        .then(() => {
          for (const env of pendingSignals.get(peerId) ?? []) {
            void peerManager?.handleSignal(env);
          }
          pendingSignals.delete(peerId);
        });
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
    onLeave: (reason: 'removed' | 'ended') => {
      peerManager?.dispose();
      peerManager = null;
      localMedia.stopAll();
      leaveRoom(reason);
    },
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
  /** Ask a peer to mute (consent banner on their side, doc 06 s.4). */
  askMute: (peerId: string) =>
    peerManager?.sendCtlTo(peerId, {
      t: 'mute-req',
      id: crypto.randomUUID(),
      ts: Date.now(),
      b: {},
    }),
  /** Lower a peer's raised hand. */
  lowerHand: (peerId: string) =>
    peerManager?.sendCtlTo(peerId, {
      t: 'lower-hand',
      id: crypto.randomUUID(),
      ts: Date.now(),
      b: {},
    }),
  /** Reassign a camera slot: the target's camera turns off. */
  revokeSlot: (peerId: string) => {
    grantedSlots.delete(peerId);
    peerManager?.sendCtlTo(peerId, {
      t: 'slot-revoke',
      id: crypto.randomUUID(),
      ts: Date.now(),
      b: {},
    });
  },
};

export async function leaveCall(): Promise<void> {
  peerManager?.dispose();
  peerManager = null;
  localMedia.stopAll();
  await membership?.leave();
  leaveRoom('left');
}

export async function endCall(): Promise<void> {
  peerManager?.dispose();
  peerManager = null;
  localMedia.stopAll();
  await membership?.end();
  leaveRoom('ended');
}

/** Send a chat message to everyone over the ctl channels. */
export function sendChat(text: string): void {
  const clean = text.trim().slice(0, 2000);
  if (!clean || !peerManager) return;
  const id = crypto.randomUUID();
  seenCtl.add(id);
  session.chat.push({
    id,
    from: session.peerId ?? 'me',
    name: settings.displayName || 'you',
    text: clean,
    ts: Date.now(),
    self: true,
  });
  peerManager.sendCtlAll({ t: 'chat', id, ts: Date.now(), b: { text: clean } });
}

/** Send a reaction emoji to everyone. */
export function sendReact(emoji: string): void {
  if (!peerManager || !(REACTION_SET as readonly string[]).includes(emoji))
    return;
  const id = crypto.randomUUID();
  seenCtl.add(id);
  session.reactions.push({
    id,
    name: settings.displayName || 'you',
    emoji,
    ts: Date.now(),
  });
  peerManager.sendCtlAll({ t: 'react', id, ts: Date.now(), b: { emoji } });
}

/** Raise or lower the local hand; broadcast via media ctl message. */
export function setHand(up: boolean): void {
  session.handUp = up;
  peerManager?.setHand(up);
}

// ---- Screen share (doc 06 s.3): host gates via ctl share-req/ok/busy -------

export function screenStreamOf(peerId: string): MediaStream | null {
  return peerManager?.screenStreamOf(peerId) ?? null;
}
// ---- Video slots (doc 06 s.4): max maxVideo camera senders ----------------

/** Number of peers currently sending camera video, including me. */
function videoSenderCount(): number {
  return (settings.camOn ? 1 : 0) + session.peers.filter((p) => p.camOn).length;
}

let slotGranted = false;
let pendingSlot = false;

export function localScreenStream(): MediaStream | null {
  const t = (peerManager as unknown as { screenTrack: MediaStreamTrack | null })
    ?.screenTrack;
  return t ? new MediaStream([t]) : null;
}

/** Any remote peer currently sharing (from their media ctl message). */
export function sharerId(): string | null {
  return session.peers.find((p) => p.screen)?.peerId ?? null;
}

async function doShare(): Promise<void> {
  if (!peerManager || peerManager.sharing) return;
  await peerManager.startShare();
  session.announce = 'You are sharing your screen';
}

/** Share: host shares directly; guests ask the host first. */
export async function shareScreen(): Promise<void> {
  if (!peerManager) return;
  const hostId = session.roster.find((r) => r.role === 'host')?.peerId;
  if (session.role === 'host' || !hostId || hostId === session.peerId) {
    await doShare();
    return;
  }
  if (session.peers.some((p) => p.screen)) {
    toast(`${nameOf(sharerId() ?? '')} is sharing. Ask them to stop first.`);
    return;
  }
  const ok = peerManager.sendCtlTo(hostId, {
    t: 'share-req',
    id: crypto.randomUUID(),
    ts: Date.now(),
    b: {},
  });
  if (!ok) {
    toast('Cannot reach the host to request sharing');
    return;
  }
  pendingShare = Date.now();
}

let pendingShare = 0;
function handleShareCtl(peerId: string, msg: CtlMessage): void {
  const hostId = session.roster.find((r) => r.role === 'host')?.peerId;
  if (msg.t === 'share-req' && session.role === 'host') {
    // Auto-grant when nobody is sharing; otherwise refuse with a name.
    const sharer = session.peers.find((p) => p.screen);
    peerManager?.sendCtlTo(peerId, {
      t: sharer ? 'share-busy' : 'share-ok',
      id: msg.id,
      ts: Date.now(),
      b: sharer ? { name: sharer.name } : {},
    });
    return;
  }
  if (msg.t === 'share-ok' && pendingShare && peerId === hostId) {
    pendingShare = 0;
    void doShare();
    return;
  }
  if (msg.t === 'share-busy' && pendingShare && peerId === hostId) {
    pendingShare = 0;
    const name = (msg.b as { name?: string } | undefined)?.name ?? 'Someone';
    toast(`${name} is sharing. Ask them to stop first.`);
  }
}

export function stopShare(): void {
  void peerManager?.stopShare();
  session.announce = 'You stopped sharing';
}

// ---- Off-screen pause (doc 04 s.3): tell peers when their tile hides -------

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- debounce timers, not state
const watchTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Tile visibility: immediate `watch:true`, `watch:false` only after 10 s. */
export function reportWatching(peerId: string, visible: boolean): void {
  const send = (watching: boolean) =>
    peerManager?.sendCtlTo(peerId, {
      t: 'watch',
      id: crypto.randomUUID(),
      ts: Date.now(),
      b: { watching },
    });
  if (visible) {
    const t = watchTimers.get(peerId);
    if (t) {
      clearTimeout(t);
      watchTimers.delete(peerId);
    }
    send(true);
    return;
  }
  if (watchTimers.has(peerId)) return;
  watchTimers.set(
    peerId,
    setTimeout(() => {
      watchTimers.delete(peerId);
      send(false);
    }, 10_000),
  );
}

/** Test hook: sender encoding parameters for a peer's camera sender. */
export function debugEncoding(peerId: string): RTCRtpEncodingParameters | null {
  const p = (
    peerManager as unknown as { peers: Map<string, { pc: RTCPeerConnection }> }
  )?.peers.get(peerId);
  const sender = p?.pc.getTransceivers()[1]?.sender;
  return sender?.getParameters().encodings?.[0] ?? null;
}

// ---- File transfer (doc 06 s.2), lazy-loaded on first use -----------------

let _files: import('../core/files/fileTransfer').FileTransfer | null = null;
async function initFiles() {
  if (_files || !peerManager) return _files;
  const { FileTransfer } = await import('../core/files/fileTransfer');
  _files = new FileTransfer(
    (peerId, label) => peerManager!.createChannel(peerId, label),
    (peerId, b) =>
      peerManager!.sendCtlTo(peerId, {
        t: b.t as string,
        id: crypto.randomUUID(),
        ts: Date.now(),
        b: b.b as Record<string, unknown>,
      }),
    {
      onUpdate(t) {
        if (t.blob) fileBlobs.set(t.id, t.blob);
        const { blob: _blob, ...ui } = t;
        void _blob;
        const i = session.files.findIndex(
          (f) => f.id === t.id && f.peerId === t.peerId,
        );
        if (i >= 0) session.files[i] = { ...ui };
        else session.files.push({ ...ui });
      },
    },
  );
  return _files;
}

export async function sendFile(file: File): Promise<void> {
  const ft = await initFiles();
  if (!ft || !peerManager) return;
  if (file.size > 100 * 1024 * 1024) {
    toast('Files are limited to 100 MB');
    return;
  }
  ft.offer(
    file,
    session.peers.map((p) => p.peerId),
  );
}

export async function acceptFile(id: string, peerId: string): Promise<void> {
  (await initFiles())?.accept(id, peerId);
}
export async function declineFile(id: string, peerId: string): Promise<void> {
  (await initFiles())?.decline(id, peerId);
}
export async function cancelFile(id: string): Promise<void> {
  (await initFiles())?.cancel(id);
}

// Blobs live outside reactive state (a Svelte proxy breaks Blob methods).
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- raw blob store
const fileBlobs = new Map<string, Blob>();
export function fileBlobOf(id: string): Blob | undefined {
  return fileBlobs.get(id);
}

export async function saveFile(t: TransferState): Promise<void> {
  const blob = fileBlobs.get(t.id);
  if (!blob) return;
  const { FileTransfer } = await import('../core/files/fileTransfer');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FileTransfer.safeName(t.name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ---- Recording compositor (doc 06 s.5), lazy-loaded -----------------------

let _compositor: import('../core/recording/compositor').Compositor | null =
  null;

/** Start the composite preview; returns the compositor (and its canvas). */
export async function startComposite() {
  if (_compositor) return _compositor;
  const { Compositor } = await import('../core/recording/compositor');
  _compositor = new Compositor(
    () => [
      {
        peerId: session.peerId ?? 'me',
        name: settings.displayName || 'You',
        stream: localMedia.snapshot().stream,
        video: localMedia.snapshot().video,
        speaking: false,
      },
      ...session.peers.map((p) => ({
        peerId: p.peerId,
        name: p.name,
        stream: peerStreamOf(p.peerId),
        video: p.camOn
          ? (peerStreamOf(p.peerId)?.getVideoTracks()[0] ?? null)
          : null,
        speaking: p.peerId === activeSpeaker.active,
      })),
    ],
    () => {
      const sharer = session.peers.find((p) => p.screen);
      if (sharer) {
        const s = screenStreamOf(sharer.peerId);
        return s ? { name: sharer.name, stream: s } : null;
      }
      if (localScreenStream()) {
        return { name: 'You', stream: localScreenStream()! };
      }
      return null;
    },
  );
  return _compositor;
}

export function stopComposite(): void {
  _compositor?.dispose();
  _compositor = null;
}

// ---- Local recording (doc 06 s.5, host only) --------------------------------

let _recorder: import('../core/recording/recorder').Recorder | null = null;

export async function startRecording(opts?: {
  preferOpfs?: boolean;
}): Promise<void> {
  if (session.role !== 'host' || session.recording) return;
  const c = await startComposite();
  const { Recorder } = await import('../core/recording/recorder');
  _recorder = new Recorder();
  await _recorder.start(c.getStream(), opts);
  if (_recorder.state === 'recording') {
    session.recording = true;
    peerManager?.setRecording(true);
    session.announce = 'Recording started';
  }
}

export async function stopRecording(): Promise<void> {
  if (!_recorder) return;
  const blob = await _recorder.stop();
  _recorder = null;
  session.recording = false;
  peerManager?.setRecording(false);
  session.announce = 'Recording stopped';
  stopComposite();
  if (blob) {
    // Buffered path (non-FS browsers): download the finished file.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meshly-${Date.now()}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/** True while anyone records (my flag or a peer's media broadcast). */
export function recordingActive(): boolean {
  return session.recording || session.peers.some((p) => p.recording);
}

/** Two-tone notice chime for everyone when recording starts (doc 06 s.5). */
let chimeCtx: AudioContext | null = null;
export function playRecordChime(): void {
  try {
    chimeCtx ??= new AudioContext();
    void chimeCtx.resume();
    const t0 = chimeCtx.currentTime;
    for (const [i, freq] of [880, 660].entries()) {
      const osc = chimeCtx.createOscillator();
      const gain = chimeCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.15, t0 + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16);
      osc.connect(gain).connect(chimeCtx.destination);
      osc.start(t0 + i * 0.18);
      osc.stop(t0 + i * 0.18 + 0.18);
    }
  } catch {
    /* no audio output or autoplay blocked: banner still shows */
  }
}

// ---- AI notes consent (doc 06 s.6) -----------------------------------------

/** Peers who allowed my AI notes to transcribe them (I am the note-taker). */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- consent set, not UI state
const notesAllowed = new Set<string>();

/** Track IDs I may transcribe: consented peers plus my own mic. */
export function consentedPeerIds(): string[] {
  return [...notesAllowed];
}

export function answerNotesConsent(allow: boolean): void {
  const ask = session.notesAsk;
  if (!ask) return;
  session.notesConsent = allow;
  session.notesAsk = null;
  peerManager?.sendCtlTo(ask.fromId, {
    t: 'notes-consent',
    id: crypto.randomUUID(),
    ts: Date.now(),
    b: { allow },
  });
}

/** Revoke consent mid-meeting (AI notes pill). */
export function revokeNotesConsent(): void {
  if (!session.noteTaker) return;
  session.notesConsent = false;
  peerManager?.sendCtlTo(session.noteTaker, {
    t: 'notes-consent',
    id: crypto.randomUUID(),
    ts: Date.now(),
    b: { allow: false },
  });
}

// ---- Transcription pipeline (doc 06 s.6) -----------------------------------

let pipeline: NotesPipeline | null = null;
let notesTimer: ReturnType<typeof setInterval> | null = null;
let lastNotesLen = 0;

async function ensurePipeline(transcribe?: TranscribeFn): Promise<void> {
  if (pipeline) return;
  const { NotesPipeline } = await import('../core/ai/pipeline');
  const fn: TranscribeFn =
    transcribe ??
    ((blob: Blob) =>
      import('../core/ai/transcribe').then((m) => m.transcribeBlob(blob)));
  pipeline = new NotesPipeline(fn);
  pipeline.onLines = () => {
    session.transcript = [...pipeline!.lines];
  };
  pipeline.onError = () => toast('An AI segment failed after 3 retries');
  // My own mic is included by default.
  const snap = localMedia.snapshot();
  if (snap.stream) pipeline.addTrack('me', 'You', snap.stream);
  // Live notes every 5 min while notes run.
  notesTimer = setInterval(() => void updateNotes(), 5 * 60_000);
}

/** Include a peer's audio once they consent. */
function addConsentedTrack(peerId: string): void {
  const stream = peerStreamOf(peerId);
  if (pipeline && stream) pipeline.addTrack(peerId, nameOf(peerId), stream);
}

/** Start AI notes: tell every peer, show the pill (doc 06 s.6 step 2). */
export function startNotes(transcribe?: TranscribeFn): void {
  if (!peerManager) return;
  session.noteTaker = session.peerId ?? '';
  void ensurePipeline(transcribe);
  peerManager.sendCtlAll({
    t: 'notes-req',
    id: crypto.randomUUID(),
    ts: Date.now(),
    b: { name: settings.displayName || 'A participant' },
  });
  session.announce = 'AI notes started';
}

export function stopNotes(): void {
  session.noteTaker = '';
  notesAllowed.clear();
  peerManager?.sendCtlAll({
    t: 'notes-off',
    id: crypto.randomUUID(),
    ts: Date.now(),
    b: {},
  });
  if (notesTimer) clearInterval(notesTimer);
  notesTimer = null;
  pipeline?.dispose();
  pipeline = null;
  lastNotesLen = 0;
  session.announce = 'AI notes stopped';
}

/** Note-taker side: peers who have consented (for the transcription gate). */
export function notesConsented(peerId: string): boolean {
  return notesAllowed.has(peerId);
}

/** Test hook: how many audio taps the pipeline holds. */
export function debugTaps(): number {
  return pipeline
    ? ((pipeline as unknown as { taps?: Map<string, unknown> }).taps?.size ??
        -1)
    : -2;
}

// ---- Summaries (doc 06 s.6) -------------------------------------------------

let localSummaryPipe: ((m: AiChatMsg[]) => Promise<unknown>) | null = null;

async function summarise(messages: AiChatMsg[]): Promise<string> {
  if (settings.aiProvider !== 'local') {
    const { chat } = await import('../core/ai/openaiCompat');
    return chat(settings.aiBaseUrl, settings.aiKey, settings.aiModel, messages);
  }
  // Local summary via transformers.js text generation.
  if (!localSummaryPipe) {
    const { pipeline } = await import('@huggingface/transformers');
    const preset = (await import('../core/ai/providers')).presetOf('local');
    localSummaryPipe = (await pipeline(
      'text-generation',
      settings.aiModel || preset.summaryModel,
      { dtype: 'q4' },
    )) as unknown as typeof localSummaryPipe;
  }
  const prompt = messages
    .map(
      (m) => `${m.role === 'system' ? 'Instructions' : 'Input'}: ${m.content}`,
    )
    .join('\n\n');
  const out = (await localSummaryPipe!(prompt as unknown as AiChatMsg[])) as
    { generated_text?: string } | { generated_text?: string }[];
  const text = Array.isArray(out)
    ? out[0]?.generated_text
    : out?.generated_text;
  return typeof text === 'string' ? text : '';
}

/** Rolling notes: summarise the new transcript onto the existing notes. */
export async function updateNotes(): Promise<void> {
  if (!pipeline || session.notesBusy) return;
  const transcript = pipeline.transcript();
  if (transcript.length <= lastNotesLen) return;
  session.notesBusy = true;
  try {
    const { NOTES_SYSTEM, liveNotesUser } = await import('../core/ai/prompts');
    const update = await summarise([
      { role: 'system', content: NOTES_SYSTEM },
      {
        role: 'user',
        content: liveNotesUser(
          transcript.slice(lastNotesLen),
          session.notesText,
        ),
      },
    ]);
    if (update.trim()) {
      session.notesText = update.trim();
      lastNotesLen = transcript.length;
    }
  } catch (e) {
    toast(`Notes update failed: ${String(e).slice(0, 80)}`);
  } finally {
    session.notesBusy = false;
  }
}

/** Final Markdown summary (called on End AI notes or meeting end). */
export async function finalNotes(): Promise<string> {
  if (!pipeline) return '';
  session.notesBusy = true;
  try {
    const { FINAL_SYSTEM, finalSummaryUser } =
      await import('../core/ai/prompts');
    const out = await summarise([
      { role: 'system', content: FINAL_SYSTEM },
      { role: 'user', content: finalSummaryUser(pipeline.transcript()) },
    ]);
    if (out.trim()) session.notesText = out.trim();
    return session.notesText;
  } catch (e) {
    toast(`Final summary failed: ${String(e).slice(0, 80)}`);
    return session.notesText;
  } finally {
    session.notesBusy = false;
  }
}

/** Build the export Markdown (used by download and share). */
export function notesMarkdown(): string {
  const names = session.peers.map((p) => p.name);
  return [
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- one-off label, not state
    `# Meshly notes - ${new Date().toLocaleDateString('en-GB')}`,
    `Participants: ${[settings.displayName || 'You', ...names].join(', ')}`,
    '',
    session.notesText || '(no summary yet)',
    '',
    '## Transcript',
    pipeline?.transcript() ?? '(empty)',
  ].join('\n');
}

/** Share the notes Markdown with every participant (doc 06 s.6). */
export function shareNotes(): void {
  peerManager?.sendCtlAll({
    t: 'notes-share',
    id: crypto.randomUUID(),
    ts: Date.now(),
    b: { md: notesMarkdown() },
  });
  session.announce = 'Notes shared with everyone';
}

/** Export the notes + transcript as a Markdown download. */
export function downloadNotes(md = notesMarkdown()): void {
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meshly-notes-${Date.now()}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** On app load: offer to recover a recording cut short by a crash. */
export async function checkRecordingRecovery(): Promise<void> {
  const { Recorder } = await import('../core/recording/recorder');
  const orphan = await Recorder.findOrphaned();
  if (!orphan) return;
  const url = URL.createObjectURL(orphan);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meshly-recovered-${Date.now()}.webm`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast('Recovered an interrupted recording');
}

/** Test hook: force an ICE restart toward a peer (T2.5 reconnect e2e). */
export function debugRestartIce(peerId: string): void {
  const p = (
    peerManager as unknown as {
      peers: Map<string, { requestRestart(): void }>;
    }
  )?.peers.get(peerId);
  p?.requestRestart();
}

/** Test hook: inject a ctl message as if it arrived from a peer. */
export function debugInjectCtl(peerId: string, msg: CtlMessage): void {
  peerManager?.handleCtl(peerId, msg);
}

/** Media toggles: settings store + LocalMedia, which replaceTracks all peers. */
export const mediaActions = {
  async setMic(on: boolean) {
    settings.micOn = on;
    await localMedia.setMic(on);
    peerManager?.broadcastMediaState();
  },
  async setCam(on: boolean) {
    if (
      on &&
      session.role !== 'host' &&
      !slotGranted &&
      videoSenderCount() >= config.maxVideo
    ) {
      const hostId = hostPeerId();
      if (
        hostId &&
        peerManager?.sendCtlTo(hostId, {
          t: 'slot-req',
          id: crypto.randomUUID(),
          ts: Date.now(),
          b: {},
        })
      ) {
        pendingSlot = true;
        return;
      }
      toast('No free camera slots right now');
      return;
    }
    settings.camOn = on;
    await localMedia.setCam(on);
    peerManager?.broadcastMediaState();
  },
  async flipCamera() {
    await localMedia.flipCamera();
  },
};
