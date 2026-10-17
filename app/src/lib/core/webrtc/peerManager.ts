/**
 * PeerManager, doc 04 section 1: owns Map<peerId, Peer>, creates connections
 * after ticket verification, applies local tracks, batches signalling through
 * the hub, and cleans up on bye/kick/end.
 */

import { Peer, type PeerEvents } from './peer';
import type { SignallingHub } from '../signalling/hub';
import type { Envelope } from '../signalling/envelope';
import type { LocalMedia } from '../media/localMedia';
import type { RosterEntry } from '../room/state';
import { config } from '../../../config';

export interface PeerInfo {
  peerId: string;
  name: string;
  state: RTCPeerConnectionState;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface PeerManagerEvents {
  onPeersChanged(peers: PeerInfo[]): void;
  onPeerJoined?(peerId: string): void;
  onPeerLeft?(peerId: string): void;
}

export class PeerManager {
  private peers = new Map<string, Peer>();
  private rosterNames = new Map<string, string>();
  private wakeLock: { release(): Promise<void> } | null = null;
  private visHandler: (() => void) | null = null;

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
    }));
  }

  private notify(): void {
    this.events.onPeersChanged(this.list());
  }

  private peerEvents(): PeerEvents {
    return {
      send: (type, body, to) =>
        this.hub.send(type, body, to, true).catch(() => undefined),
      onTrack: () => this.notify(),
      onConnectionState: (peerId, state) => {
        if (state === 'connected') this.events.onPeerJoined?.(peerId);
        this.notify();
      },
      onCtlMessage: (peerId, data) => this.onCtl(peerId, data),
    };
  }

  private onCtl(peerId: string, data: unknown): void {
    // ctl channel protocol arrives in T1.8; keep the hook minimal.
    void peerId;
    void data;
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
    p.stream.getTracks().forEach((t) => t.stop());
    p.close();
    this.peers.delete(peerId);
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
