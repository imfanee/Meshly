/**
 * PeerManager, doc 04 section 1: owns Map<peerId, Peer>, creates connections
 * after ticket verification, applies local tracks, batches signalling through
 * the hub, and cleans up on bye/kick/end.
 */

import { Peer, type PeerEvents } from './peer';
import type { SignallingHub } from '../signalling/hub';
import type { Envelope } from '../signalling/envelope';
import type { LocalMedia } from '../media/localMedia';
import { activeSpeaker } from '../media/activeSpeaker';
import type { RosterEntry } from '../room/state';
import { config } from '../../../config';

export type LinkKind = 'direct' | 'relayed' | 'unknown';
export type LinkQuality = 'good' | 'fair' | 'poor' | 'unknown';

export interface PeerInfo {
  peerId: string;
  name: string;
  state: RTCPeerConnectionState;
  hasAudio: boolean;
  hasVideo: boolean;
  /** Remote-reported media state over the ctl channel. */
  micOn: boolean;
  camOn: boolean;
  /** Raised hand, from the ctl media message. */
  hand: boolean;
  link: LinkKind;
  quality: LinkQuality;
}

/** What a peer last told us about its mic/camera via the ctl channel. */
const peerMedia = new Map<
  string,
  { micOn: boolean; camOn: boolean; hand: boolean }
>();
const peerLinks = new Map<string, { link: LinkKind; quality: LinkQuality }>();

export interface PeerManagerEvents {
  onPeersChanged(peers: PeerInfo[]): void;
  onPeerJoined?(peerId: string): void;
  onPeerLeft?(peerId: string): void;
  /** Non-media ctl traffic (chat, reactions, …) for the session to handle. */
  onCtl?(peerId: string, msg: CtlMessage): void;
}

/** ctl channel message shape, doc 03 section 8: { t, id, ts, b }. */
export interface CtlMessage {
  t: string;
  id: string;
  ts: number;
  b?: unknown;
}

export class PeerManager {
  private peers = new Map<string, Peer>();
  private rosterNames = new Map<string, string>();
  private wakeLock: { release(): Promise<void> } | null = null;
  private visHandler: (() => void) | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private hub: SignallingHub,
    private selfId: string,
    private media: LocalMedia,
    private events: PeerManagerEvents,
  ) {
    // Media toggles/switches just update LocalMedia; this listener pushes the
    // new tracks to every peer (replaceTrack + direction fix).
    media.onChange(() => void this.applyLocalTracks());
  }

  streamOf(peerId: string): MediaStream | null {
    return this.peers.get(peerId)?.stream ?? null;
  }

  has(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  list(): PeerInfo[] {
    return [...this.peers.values()].map((p) => ({
      peerId: p.peerId,
      name: this.rosterNames.get(p.peerId) ?? p.peerId.slice(0, 6),
      state: p.pc.connectionState,
      hasAudio: p.stream.getAudioTracks().length > 0,
      hasVideo: p.stream.getVideoTracks().length > 0,
      micOn: peerMedia.get(p.peerId)?.micOn ?? true,
      camOn: peerMedia.get(p.peerId)?.camOn ?? true,
      hand: peerMedia.get(p.peerId)?.hand ?? false,
      link: peerLinks.get(p.peerId)?.link ?? 'unknown',
      quality: peerLinks.get(p.peerId)?.quality ?? 'unknown',
    }));
  }

  private notify(): void {
    this.events.onPeersChanged(this.list());
  }

  private peerEvents(): PeerEvents {
    return {
      send: (type, body, to) =>
        this.hub.send(type, body, to, true).catch(() => undefined),
      onTrack: (peerId, stream) => {
        activeSpeaker.watch(peerId, stream);
        this.notify();
      },
      onConnectionState: (peerId, state) => {
        if (state === 'connected') this.events.onPeerJoined?.(peerId);
        this.notify();
      },
      onCtlOpen: (peerId) => {
        const p = this.peers.get(peerId);
        // Tell the peer our media state so their tiles match reality.
        p?.ctl?.send(JSON.stringify(this.mediaMsg()));
      },
      onCtlMessage: (peerId, data) => this.onCtl(peerId, data),
    };
  }

  private hand = false;

  private mediaMsg(): CtlMessage {
    const snap = this.media.snapshot();
    return {
      t: 'media',
      id: crypto.randomUUID(),
      ts: Date.now(),
      b: {
        audio: snap.audio?.enabled !== false && !!snap.audio,
        video: !!snap.video,
        screen: false,
        hand: this.hand,
      },
    };
  }

  /** Public so tests can inject ctl messages. */
  handleCtl(peerId: string, data: unknown): void {
    this.onCtl(peerId, data);
  }

  private onCtl(peerId: string, data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const m = data as { t?: string; b?: Record<string, unknown> };
    if (m.t === 'media' && m.b) {
      peerMedia.set(peerId, {
        micOn: m.b.audio !== false,
        camOn: m.b.video === true,
        hand: m.b.hand === true,
      });
      this.notify();
      return;
    }
    this.events.onCtl?.(peerId, data as CtlMessage);
  }

  /** Push our mic/cam/hand state to every open ctl channel. */
  broadcastMediaState(): void {
    const msg = JSON.stringify(this.mediaMsg());
    for (const p of this.peers.values()) {
      if (p.ctl?.readyState === 'open') p.ctl.send(msg);
    }
  }

  /** Raise or lower the local hand and tell everyone. */
  setHand(up: boolean): void {
    this.hand = up;
    this.broadcastMediaState();
  }

  /** Broadcast a ctl message (chat, react, …) to every open channel. */
  sendCtlAll(msg: CtlMessage): void {
    const s = JSON.stringify(msg);
    for (const p of this.peers.values()) {
      if (p.ctl?.readyState === 'open') p.ctl.send(s);
    }
  }

  /** Existing member side: create PC after verified hello; answerer waits. */
  async ensurePeer(peerId: string): Promise<Peer> {
    let p = this.peers.get(peerId);
    if (p) return p;
    p = new Peer(
      peerId,
      this.selfId,
      this.peerEvents(),
      this.iceServers(),
      false,
    );
    this.peers.set(peerId, p);
    this.notify();
    return p;
  }

  /** Admitted guest: offer to every existing roster member. */
  async offerToAll(roster: RosterEntry[]): Promise<void> {
    for (const r of roster) {
      if (r.peerId === this.selfId) continue;
      this.rosterNames.set(r.peerId, r.name);
      if (!this.peers.has(r.peerId)) {
        const p = new Peer(
          r.peerId,
          this.selfId,
          this.peerEvents(),
          this.iceServers(),
          true,
        );
        this.peers.set(r.peerId, p);
      }
    }
    await this.applyLocalTracks();
    this.applyBitratePolicy();
    this.notify();
  }

  private iceServers(): RTCIceServer[] {
    const urls = [...config.stunUrls];
    if (config.ownStunUrl) urls.push(config.ownStunUrl);
    return urls.length ? [{ urls }] : [];
  }

  async applyLocalTracks(): Promise<void> {
    const snap = this.media.snapshot();
    for (const p of this.peers.values()) {
      await p.setLocalTracks(snap.audio, snap.video);
    }
    this.notify();
  }

  /** Doc 04 section 3: scale camera bitrate by remote receiver count. */
  applyBitratePolicy(relayed = false): void {
    const n = Math.max(1, this.peers.size);
    const kbps = relayed ? 500 : n <= 2 ? 1500 : n <= 4 ? 800 : 450;
    const scale = relayed ? 2 : n <= 2 ? 1 : n <= 4 ? 1.5 : 2;
    const fps = relayed ? 20 : n <= 2 ? 30 : n <= 4 ? 24 : 20;
    for (const p of this.peers.values()) {
      const sender = p.pc.getTransceivers()[1]?.sender;
      if (!sender) continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = kbps * 1000;
      params.encodings[0].scaleResolutionDownBy = scale;
      params.encodings[0].maxFramerate = fps;
      void sender.setParameters(params).catch(() => undefined);
    }
  }

  /** Route an sdp/ice envelope to the right peer. */
  async handleSignal(env: Envelope): Promise<void> {
    if (env.t !== 'sdp' && env.t !== 'ice') return;
    const p = await this.ensurePeer(env.from);
    await p.handleSignal(env);
  }

  removePeer(peerId: string): void {
    const p = this.peers.get(peerId);
    if (!p) return;
    activeSpeaker.unwatch(peerId);
    p.stream.getTracks().forEach((t) => t.stop());
    p.close();
    this.peers.delete(peerId);
    peerMedia.delete(peerId);
    peerLinks.delete(peerId);
    this.events.onPeerLeft?.(peerId);
    this.notify();
  }

  /** Sync peers with the roster: drop anyone who left (bye/kick/state). */
  reconcile(roster: RosterEntry[]): void {
    for (const r of roster) this.rosterNames.set(r.peerId, r.name);
    const ids = new Set(roster.map((r) => r.peerId));
    ids.add(this.selfId);
    for (const peerId of [...this.peers.keys()]) {
      if (!ids.has(peerId)) this.removePeer(peerId);
    }
    this.notify();
  }

  /** Poll getStats every 2 s: candidate pair type, RTT, loss (doc 04 s.6). */
  startStats(): void {
    this.statsTimer = setInterval(() => void this.pollStats(), 2_000);
  }

  private async pollStats(): Promise<void> {
    for (const p of this.peers.values()) {
      try {
        const stats = await p.pc.getStats();
        let relayed = false;
        let rttMs = -1;
        let lossPct = -1;
        stats.forEach((r) => {
          if (
            r.type === 'candidate-pair' &&
            (r as unknown as { nominated?: boolean }).nominated
          ) {
            rttMs =
              ((r as unknown as { currentRoundTripTime?: number })
                .currentRoundTripTime ?? 0) * 1000;
            const local = stats.get(
              (r as unknown as { localCandidateId: string }).localCandidateId,
            );
            const remote = stats.get(
              (r as unknown as { remoteCandidateId: string }).remoteCandidateId,
            );
            relayed =
              (local as unknown as { candidateType?: string })
                ?.candidateType === 'relay' ||
              (remote as unknown as { candidateType?: string })
                ?.candidateType === 'relay';
          }
          if (r.type === 'remote-inbound-rtp') {
            const rr = r as unknown as {
              packetsLost?: number;
              fractionLost?: number;
            };
            if (typeof rr.fractionLost === 'number') {
              lossPct = rr.fractionLost * 100;
            }
          }
        });
        const link: LinkKind = relayed ? 'relayed' : 'direct';
        const quality: LinkQuality =
          rttMs < 0
            ? 'unknown'
            : rttMs < 150 && (lossPct < 0 || lossPct < 2)
              ? 'good'
              : rttMs < 300 && (lossPct < 0 || lossPct < 5)
                ? 'fair'
                : 'poor';
        const prev = peerLinks.get(p.peerId);
        if (prev?.link !== link || prev?.quality !== quality) {
          peerLinks.set(p.peerId, { link, quality });
          this.notify();
        }
      } catch {
        /* pc closed mid-poll */
      }
    }
  }

  async acquireWakeLock(): Promise<void> {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request(t: 'screen'): Promise<{ release(): Promise<void> }>;
        };
      };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
      this.visHandler = () => {
        if (document.visibilityState === 'visible') void this.acquireWakeLock();
      };
      document.addEventListener('visibilitychange', this.visHandler);
    } catch {
      /* wake lock unsupported or denied: ignore */
    }
  }

  dispose(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    activeSpeaker.dispose();
    if (this.visHandler) {
      document.removeEventListener('visibilitychange', this.visHandler);
      this.visHandler = null;
    }
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
    for (const peerId of [...this.peers.keys()]) this.removePeer(peerId);
    this.notify();
  }
}
