/**
 * Lobby and admission, doc 03 sections 4 to 6: knocks, admit/deny, host-here
 * heartbeats, tickets, roster and signed room state, capacity and lock.
 *
 * The class is plain TypeScript driven by hub messages; the session store and
 * routes only render the events it emits.
 */

import type { SignallingHub } from '../signalling/hub';
import type { Envelope } from '../signalling/envelope';
import type { IdentityKey } from '../crypto/sign';
import type { RoomLink } from './link';
import {
  emptyState,
  isRoster,
  signState,
  verifyState,
  type RoomState,
  type SignedRoomState,
} from './state';
import { issueTicket, verifyTicket, type SignedTicket } from '../crypto/ticket';
import type { SignedPeer } from '../signalling/envelope';

export type LobbyVerdict =
  'waiting' | 'host-away' | 'denied' | 'full' | 'locked';

export interface PendingKnock {
  peerId: string;
  name: string;
  wantsVideo: boolean;
  lastSeen: number;
}

export interface MembershipEvents {
  /** Guest: host answered. */
  onVerdict?(v: Exclude<LobbyVerdict, 'waiting' | 'host-away'>): void;
  /** Guest: admitted; roster and state are current. */
  onAdmitted?(): void;
  /** Guest: host heartbeat seen (or not) affects lobby status. */
  onHostPresence?(seen: boolean): void;
  /** Host: pending knocks changed. */
  onKnocks?(knocks: PendingKnock[]): void;
  /** Everyone: roster/state changed. */
  onState?(state: RoomState): void;
  /** A peer presented a valid ticket in hello (safe to connect WebRTC). */
  onPeerVerified?(peerId: string): void;
  /** Everyone: kicked, ended or dropped out. */
  onLeave?(reason: 'removed' | 'ended'): void;
  onError?(message: string): void;
}

const KNOCK_INTERVAL_MS = 5_000;
const HOST_HERE_MS = 15_000;
const HOST_AWAY_MS = 25_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

export class Membership {
  private pending = new Map<string, PendingKnock>();
  private state: RoomState | null = null;
  private knockTimer: ReturnType<typeof setInterval> | null = null;
  private hostHereTimer: ReturnType<typeof setInterval> | null = null;
  private hostWatchTimer: ReturnType<typeof setInterval> | null = null;
  private lastHostHere = 0;
  private hostSpki: string | null = null;
  private myTicket: SignedTicket | null = null;
  private disposed = false;
  /** Peers that presented a valid ticket (doc 03 s.5). */
  private verified = new Set<string>();

  constructor(
    private hub: SignallingHub,
    private identity: IdentityKey,
    private room: RoomLink,
    private displayName: string,
    private role: 'host' | 'guest',
    private maxParticipants: number,
    private events: MembershipEvents,
    private now: () => number = () => Date.now(),
  ) {}

  get peerId(): string {
    return this.hub.peerId;
  }
  /** Whether a peer has presented a valid admission ticket. */
  isVerified(peerId: string): boolean {
    return this.verified.has(peerId);
  }
  get knocks(): PendingKnock[] {
    return [...this.pending.values()];
  }
  get roomState(): RoomState | null {
    return this.state;
  }

  /** Host: self-ticket, initial state, heartbeat, then listen. */
  async startHost(): Promise<void> {
    this.myTicket = await issueTicket(this.identity.privateKey, {
      roomId: this.room.roomId,
      peerId: this.peerId,
      name: this.displayName,
      role: 'host',
    });
    this.state = emptyState(this.room.roomId, this.peerId, this.displayName);
    this.hostSpki = this.identity.spki;
    this.hostHereTimer = setInterval(() => {
      void this.beat();
    }, HOST_HERE_MS);
    await this.beat();
    this.events.onState?.(this.state);
  }

  private async beat(): Promise<void> {
    if (this.disposed || !this.state) return;
    await this.hub.send('host-here', { seq: this.state.seq }, '*');
  }

  /** Guest: knock every 5 s until admitted or denied. */
  async knock(wantsVideo: boolean): Promise<void> {
    const ua =
      typeof navigator !== 'undefined' &&
      /Mobi|Android/i.test(navigator.userAgent)
        ? 'mobile'
        : 'desktop';
    const sendKnock = () =>
      this.hub.send(
        'knock',
        { name: this.displayName, wantsVideo, ua },
        '*',
        true,
      );
    this.knockTimer = setInterval(() => {
      if (!this.disposed) void sendKnock().catch(() => undefined);
    }, KNOCK_INTERVAL_MS);
    await sendKnock();
    // Host-presence watcher for the lobby "host away" state.
    this.lastHostHere = 0;
    this.hostWatchTimer = setInterval(() => {
      const seen =
        this.lastHostHere > 0 && this.now() - this.lastHostHere < HOST_AWAY_MS;
      this.events.onHostPresence?.(seen);
    }, 5_000);
  }

  /** Host: admit a pending knocker. */
  async admit(knockPeerId: string): Promise<void> {
    const knock = this.pending.get(knockPeerId);
    if (!knock || !this.state) return;
    this.pending.delete(knockPeerId);
    const ticket = await issueTicket(this.identity.privateKey, {
      roomId: this.room.roomId,
      peerId: knockPeerId,
      name: knock.name,
      role: 'guest',
    });
    this.state.roster.push({
      peerId: knockPeerId,
      name: knock.name,
      role: 'guest',
    });
    const signed = await this.bump();
    await this.hub.send(
      'admit',
      { ticket, roster: this.state.roster, state: signed },
      knockPeerId,
      true,
    );
    await this.hub.send('state', signed, '*');
    this.events.onKnocks?.(this.knocks);
  }

  /** Host: deny a pending knocker. */
  async deny(
    knockPeerId: string,
    reason: 'denied' | 'full' | 'locked' = 'denied',
  ): Promise<void> {
    this.pending.delete(knockPeerId);
    await this.hub.send('deny', { reason }, knockPeerId, true);
    this.events.onKnocks?.(this.knocks);
  }

  /** Host: kick an admitted peer. */
  async kickPeer(peerId: string): Promise<void> {
    if (!this.state) return;
    this.state.roster = this.state.roster.filter((r) => r.peerId !== peerId);
    this.state.kicked.push(peerId);
    await this.bump();
    await this.hub.send('kick', { peerId }, '*', true);
    await this.hub.send(
      'state',
      await signState(this.state, this.identity.privateKey),
      '*',
    );
  }

  /** Host: lock or unlock the room. */
  async setLocked(locked: boolean): Promise<void> {
    if (!this.state || this.state.locked === locked) return;
    this.state.locked = locked;
    const signed = await this.bump();
    await this.hub.send('state', signed, '*');
    if (locked) {
      for (const p of this.knocks) await this.deny(p.peerId, 'locked');
    }
  }

  private async bump(): Promise<SignedRoomState> {
    if (!this.state) throw new Error('membership: no state');
    this.state.seq += 1;
    const signed = await signState(this.state, this.identity.privateKey);
    this.events.onState?.(this.state);
    return signed;
  }

  /** Host: end the meeting for everyone. */
  async end(): Promise<void> {
    try {
      await this.hub.send('end', {}, '*', true);
    } finally {
      this.dispose();
    }
  }

  /** Graceful leave for both roles. */
  async leave(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.hub.send('bye', {}, '*', true);
    } catch {
      /* best effort */
    }
    this.dispose();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [
      this.knockTimer,
      this.hostHereTimer,
      this.hostWatchTimer,
    ]) {
      if (t) clearInterval(t);
    }
  }

  /** Single entry point wired to hub.onMessage. */
  async onMessage(env: Envelope, signer: SignedPeer): Promise<void> {
    if (this.disposed) return;
    const b = env.b;
    switch (env.t) {
      case 'knock':
        if (this.role !== 'host' || !this.state) return;
        this.onKnock(env, signer);
        return;
      case 'host-here':
        this.lastHostHere = this.now();
        this.events.onHostPresence?.(true);
        return;
      case 'admit':
        if (this.role !== 'guest' || env.to !== this.peerId) return;
        await this.onAdmit(env, signer);
        return;
      case 'deny':
        if (this.role !== 'guest' || env.to !== this.peerId) return;
        this.stopKnocking();
        if (
          isRecord(b) &&
          (b.reason === 'denied' ||
            b.reason === 'full' ||
            b.reason === 'locked')
        ) {
          this.events.onVerdict?.(b.reason);
        }
        return;
      case 'state':
        await this.onStateMsg(env, signer);
        return;
      case 'hello':
        await this.onHello(env, signer);
        return;
      case 'kick':
        if (isRecord(b) && b.peerId === this.peerId) {
          this.dispose();
          this.events.onLeave?.('removed');
        } else if (isRecord(b) && typeof b.peerId === 'string') {
          this.dropPeer(b.peerId);
        }
        return;
      case 'end':
        this.dispose();
        this.events.onLeave?.('ended');
        return;
      case 'bye':
        this.dropPeer(env.from);
        return;
      default:
        return;
    }
  }

  private async onKnock(env: Envelope, signer: SignedPeer): Promise<void> {
    const st = this.state;
    if (!st) return;
    // Already a member: ignore repeat knocks.
    if (st.roster.some((r) => r.peerId === env.from)) return;
    if (st.kicked.includes(env.from)) return;
    const b = env.b;
    if (!isRecord(b) || typeof b.name !== 'string') return;
    if (st.locked) {
      await this.deny(env.from, 'locked');
      return;
    }
    if (st.roster.length >= this.maxParticipants) {
      await this.deny(env.from, 'full');
      return;
    }
    const existing = this.pending.get(env.from);
    this.pending.set(env.from, {
      peerId: env.from,
      name: b.name,
      wantsVideo: b.wantsVideo === true,
      lastSeen: this.now(),
    });
    if (!existing) this.events.onKnocks?.(this.knocks);
    void signer;
  }

  private async onAdmit(env: Envelope, signer: SignedPeer): Promise<void> {
    if (!isRecord(env.b)) return;
    const { ticket, roster, state } = env.b as {
      ticket?: SignedTicket;
      roster?: unknown;
      state?: SignedRoomState;
    };
    // Host-only type already verified against the link thumbprint by the
    // pipeline; now bind the ticket to our peerId and room.
    const verdict = await verifyTicket(ticket, {
      roomId: this.room.roomId,
      peerId: this.peerId,
      hostSpki: signer.spki,
    });
    if (verdict !== 'valid' || !isRoster(roster)) return;
    const st = await verifyState(state, signer.spki);
    if (!st || st.roomId !== this.room.roomId) return;
    this.stopKnocking();
    this.myTicket = ticket ?? null;
    this.hostSpki = signer.spki;
    this.state = st;
    // The host is verified to us by the admit (host-only + thumbprint check).
    this.verified.add(env.from);
    this.hub.rememberPeer(env.from, signer.spki);
    this.events.onPeerVerified?.(env.from);
    await this.hub.send(
      'hello',
      {
        ticket,
        name: this.displayName,
        media: { audio: true, video: true },
      },
      '*',
      true,
    );
    this.events.onState?.(st);
    this.events.onAdmitted?.();
  }

  private async onStateMsg(env: Envelope, signer: SignedPeer): Promise<void> {
    // Only the host key may sign state (pipeline already enforced).
    const st = await verifyState(env.b, signer.spki);
    if (!st || st.roomId !== this.room.roomId) return;
    if (this.state && st.seq <= this.state.seq) return;
    this.state = st;
    this.hostSpki = signer.spki;
    if (st.kicked.includes(this.peerId)) {
      this.dispose();
      this.events.onLeave?.('removed');
      return;
    }
    this.events.onState?.(st);
  }

  private async onHello(env: Envelope, signer: SignedPeer): Promise<void> {
    if (!isRecord(env.b)) return;
    const { ticket } = env.b as { ticket?: SignedTicket };
    const hostSpki = this.role === 'host' ? this.identity.spki : this.hostSpki;
    if (!hostSpki) return;
    const verdict = await verifyTicket(ticket, {
      roomId: this.room.roomId,
      peerId: env.from,
      hostSpki,
      kicked: this.state ? new Set(this.state.kicked) : undefined,
    });
    if (verdict !== 'valid') return;
    if (this.role === 'host' && this.state) {
      // Defensive: hello from someone we never admitted.
      if (!this.state.roster.some((r) => r.peerId === env.from)) return;
    }
    this.hub.rememberPeer(env.from, signer.spki);
    this.verified.add(env.from);
    this.events.onPeerVerified?.(env.from);
  }

  private dropPeer(peerId: string): void {
    this.verified.delete(peerId);
    if (this.role === 'host' && this.state) {
      const had = this.state.roster.some((r) => r.peerId === peerId);
      if (!had) return;
      this.state.roster = this.state.roster.filter((r) => r.peerId !== peerId);
      this.pending.delete(peerId);
      void this.bump().then((s) => this.hub.send('state', s, '*'));
    } else if (this.state) {
      this.state.roster = this.state.roster.filter((r) => r.peerId !== peerId);
      this.events.onState?.(this.state);
    }
    this.events.onKnocks?.(this.knocks);
  }

  private stopKnocking(): void {
    if (this.knockTimer) {
      clearInterval(this.knockTimer);
      this.knockTimer = null;
    }
    if (this.hostWatchTimer) {
      clearInterval(this.hostWatchTimer);
      this.hostWatchTimer = null;
    }
  }
}
