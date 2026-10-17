/**
 * One peer connection, doc 04 section 1: W3C perfect negotiation,
 * sendrecv audio + video transceivers created by the offerer in a fixed
 * order (mid 0 audio, mid 1 camera), a `ctl` data channel, and ICE
 * candidate batching (300 ms or 10 candidates) onto the signalling hub.
 */

import type { Envelope } from '../signalling/envelope';
import type { TurnCredentials } from './turn';
import { config } from '../../../config';

export interface PeerEvents {
  /** Send a signalling body to this peer only. */
  send(type: 'sdp' | 'ice', body: unknown, to: string): Promise<void> | void;
  onTrack?(
    peerId: string,
    stream: MediaStream,
    transceiver: RTCRtpTransceiver,
  ): void;
  onConnectionState?(peerId: string, state: RTCPeerConnectionState): void;
  onIceState?(peerId: string, state: RTCIceConnectionState): void;
  onCtlMessage?(peerId: string, data: unknown): void;
  onCtlOpen?(peerId: string): void;
  /** Escalation/restart counters or TURN availability changed. */
  onDiagnostics?(peerId: string): void;
}

const ICE_BATCH_MS = 300;
const ICE_BATCH_MAX = 10;
/** disconnected for this long triggers an ICE restart (doc 04 s.4). */
const DISCONNECT_RESTART_MS = 4_000;
/** still unconnected this long after a restart triggers escalation. */
const RESTART_FAIL_MS = 8_000;
/** if we escalated and the pair still fails, ask the remote to escalate. */
const REMOTE_ASK_MS = 10_000;
/** retry cadence while the TURN endpoint is unavailable. */
const TURN_RETRY_MS = 30_000;

export class Peer {
  readonly pc: RTCPeerConnection;
  readonly stream = new MediaStream();
  polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private iceGen = 0;
  private iceBuf: RTCIceCandidateInit[] = [];
  private iceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Candidates received before the remote description was applied. */
  private pendingIce: RTCIceCandidateInit[] = [];
  ctl: RTCDataChannel | null = null;

  /** Staged-ICE diagnostics (doc 04 s.4 and s.6). */
  restarts = 0;
  escalations = 0;
  turnUnavailable = false;
  private escalated = false;
  private descSetAt = 0;
  private escalateTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private restartWatch: ReturnType<typeof setTimeout> | null = null;
  private turnRetry: ReturnType<typeof setTimeout> | null = null;
  private remoteAskTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly peerId: string,
    selfId: string,
    private events: PeerEvents,
    private iceServers: RTCIceServer[],
    private isOfferer: boolean,
    private turn: TurnCredentials | null = null,
    private relayOnly = false,
  ) {
    this.polite = selfId > peerId;
    this.pc = new RTCPeerConnection({
      iceServers,
      ...(relayOnly ? { iceTransportPolicy: 'relay' as const } : {}),
    });
    this.pc.onnegotiationneeded = () => void this.negotiate();
    this.pc.onicecandidate = (e) => this.bufferCandidate(e.candidate);
    this.pc.onicecandidateerror = () => undefined;
    this.pc.onconnectionstatechange = () =>
      this.events.onConnectionState?.(this.peerId, this.pc.connectionState);
    this.pc.oniceconnectionstatechange = () =>
      this.onIceState(this.pc.iceConnectionState);
    this.pc.ontrack = (e) => {
      this.stream.addTrack(e.track);
      this.events.onTrack?.(this.peerId, this.stream, e.transceiver);
    };
    this.pc.ondatachannel = (e) => {
      if (e.channel.label === 'ctl') this.attachCtl(e.channel);
    };
    if (isOfferer) {
      this.attachCtl(this.pc.createDataChannel('ctl', { ordered: true }));
      // Fixed transceiver order (doc 04): audio then video.
      this.pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.pc.addTransceiver('video', { direction: 'sendrecv' });
    }
  }

  private attachCtl(dc: RTCDataChannel): void {
    this.ctl = dc;
    dc.onopen = () => this.events.onCtlOpen?.(this.peerId);
    dc.onmessage = (e) => {
      try {
        this.events.onCtlMessage?.(this.peerId, JSON.parse(String(e.data)));
      } catch {
        /* hostile bytes: drop */
      }
    };
  }

  private pendingLocal: {
    audio: MediaStreamTrack | null;
    video: MediaStreamTrack | null;
  } = { audio: null, video: null };

  /** Local media tracks to send (applied via the two fixed transceivers). */
  async setLocalTracks(
    audio: MediaStreamTrack | null,
    video: MediaStreamTrack | null,
  ): Promise<void> {
    this.pendingLocal = { audio, video };
    await this.applyLocalTracks();
  }

  private async applyLocalTracks(): Promise<void> {
    const t = this.pc.getTransceivers();
    // On the answerer transceivers exist only after the offer lands; the
    // stored tracks are applied then (see handleSignal).
    if (t.length === 0) return;
    for (const [i, track] of [
      [0, this.pendingLocal.audio],
      [1, this.pendingLocal.video],
    ] as const) {
      const tr = t[i];
      if (!tr) continue;
      await tr.sender.replaceTrack(track).catch(() => undefined);
      // Transceivers created from a remote offer start 'recvonly'; binding a
      // track needs the direction to include sending (may renegotiate).
      if (track && tr.direction === 'recvonly') tr.direction = 'sendrecv';
    }
  }

  /** localDescription is a platform object; copy the fields explicitly so
   * JSON serialization (and canonical signing) sees them. */
  private localDesc(): RTCSessionDescriptionInit | null {
    const d = this.pc.localDescription;
    return d ? { type: d.type, sdp: d.sdp } : null;
  }

  private async negotiate(): Promise<void> {
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      await this.events.send(
        'sdp',
        { description: this.localDesc() },
        this.peerId,
      );
    } finally {
      this.makingOffer = false;
    }
  }

  private bufferCandidate(c: RTCIceCandidate | null): void {
    if (c) this.iceBuf.push(c.toJSON());
    if (this.iceTimer) clearTimeout(this.iceTimer);
    if (c === null || this.iceBuf.length >= ICE_BATCH_MAX) {
      void this.flushIce();
      return;
    }
    this.iceTimer = setTimeout(() => void this.flushIce(), ICE_BATCH_MS);
  }

  private async flushIce(): Promise<void> {
    if (this.iceBuf.length === 0) return;
    const candidates = this.iceBuf.splice(0);
    await this.events.send(
      'ice',
      { candidates, restart: this.iceGen },
      this.peerId,
    );
  }

  /** ICE state watcher: escalation and disconnected handling (doc 04 s.4). */
  private onIceState(state: RTCIceConnectionState): void {
    this.events.onIceState?.(this.peerId, state);
    if (state === 'failed') {
      void this.escalate();
      return;
    }
    if (state === 'disconnected') {
      // 4 s grace, then restart with the current configuration.
      this.disconnectTimer ??= setTimeout(() => {
        this.disconnectTimer = null;
        if (this.pc.iceConnectionState === 'disconnected') this.restartIce();
      }, DISCONNECT_RESTART_MS);
      return;
    }
    if (state === 'connected' || state === 'completed') {
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
      }
      if (this.escalateTimer) {
        clearTimeout(this.escalateTimer);
        this.escalateTimer = null;
      }
      if (this.restartWatch) {
        clearTimeout(this.restartWatch);
        this.restartWatch = null;
      }
      if (this.remoteAskTimer) {
        clearTimeout(this.remoteAskTimer);
        this.remoteAskTimer = null;
      }
      if (this.turnRetry) {
        clearTimeout(this.turnRetry);
        this.turnRetry = null;
      }
      if (this.turnUnavailable) {
        this.turnUnavailable = false;
        this.events.onDiagnostics?.(this.peerId);
      }
    }
  }

  /** Called once both descriptions exist; arms the 8 s escalation timer. */
  private armEscalationWatch(): void {
    if (this.descSetAt || this.pc.connectionState === 'connected') return;
    this.descSetAt = Date.now();
    this.escalateTimer = setTimeout(() => {
      if (
        this.pc.iceConnectionState !== 'connected' &&
        this.pc.iceConnectionState !== 'completed'
      ) {
        void this.escalate();
      }
    }, config.iceEscalateMs);
  }

  /** External restart trigger (network change, watchdog). */
  requestRestart(): void {
    this.restartIce();
  }

  private restartIce(): void {
    this.iceGen += 1;
    this.restarts += 1;
    this.pc.restartIce();
    this.events.onDiagnostics?.(this.peerId);
    // If still not connected 8 s after the restart, escalate.
    if (this.restartWatch) clearTimeout(this.restartWatch);
    this.restartWatch = setTimeout(() => {
      if (
        this.pc.iceConnectionState !== 'connected' &&
        this.pc.iceConnectionState !== 'completed'
      ) {
        void this.escalate();
      }
    }, RESTART_FAIL_MS);
  }

  /** Stage 2: fetch TURN credentials, setConfiguration, restart (doc 04). */
  async escalate(): Promise<void> {
    if (this.escalated) return;
    const creds = await this.turn?.get();
    if (!creds) {
      // TURN down: warn via diagnostics, keep Stage 1, retry every 30 s.
      if (!this.turnUnavailable) {
        this.turnUnavailable = true;
        this.events.onDiagnostics?.(this.peerId);
      }
      if (!this.turnRetry) {
        this.turnRetry = setTimeout(() => {
          this.turnRetry = null;
          if (
            this.pc.iceConnectionState !== 'connected' &&
            this.pc.iceConnectionState !== 'completed'
          ) {
            void this.escalate();
          }
        }, TURN_RETRY_MS);
      }
      return;
    }
    this.escalated = true;
    this.escalations += 1;
    try {
      this.pc.setConfiguration({
        iceServers: [...this.iceServers, ...creds.iceServers],
        ...(this.relayOnly ? { iceTransportPolicy: 'relay' as const } : {}),
      });
    } catch {
      /* pc closed */
      return;
    }
    this.restartIce();
    // If the pair still fails 10 s after we escalated, ask the remote side
    // to escalate too (one relayed leg is usually enough).
    this.remoteAskTimer = setTimeout(() => {
      if (
        this.pc.iceConnectionState !== 'connected' &&
        this.pc.iceConnectionState !== 'completed'
      ) {
        void this.events.send(
          'ice',
          { candidates: [], restart: this.iceGen + 1, relay: true },
          this.peerId,
        );
      }
    }, REMOTE_ASK_MS);
  }

  /** The remote asked us to escalate too: sync the generation, add TURN. */
  private joinRemoteEscalation(restart: number): void {
    if (restart <= this.iceGen) return;
    this.iceGen = restart;
    void this.escalate();
  }

  /** Handle an sdp or ice envelope addressed to us. */
  async handleSignal(env: Envelope): Promise<void> {
    if (env.t === 'sdp') {
      const { description } = env.b as {
        description: RTCSessionDescriptionInit;
      };
      if (!description?.type || !description.sdp) return;
      const offerCollision =
        description.type === 'offer' &&
        (this.makingOffer || this.pc.signalingState !== 'stable');
      this.ignoreOffer = !this.polite && offerCollision;
      if (this.ignoreOffer) return;
      await this.pc.setRemoteDescription(description);
      this.armEscalationWatch();
      // Any candidates that arrived early can be applied now.
      for (const c of this.pendingIce.splice(0)) {
        try {
          await this.pc.addIceCandidate(c);
        } catch {
          /* stale candidate: drop */
        }
      }
      if (description.type === 'offer') {
        // Transceivers now exist: bind our stored local tracks before answering.
        await this.applyLocalTracks();
        await this.pc.setLocalDescription();
        await this.events.send(
          'sdp',
          { description: this.localDesc() },
          this.peerId,
        );
      }
      return;
    }
    if (env.t === 'ice') {
      const { candidates, restart, relay } = env.b as {
        candidates?: RTCIceCandidateInit[];
        restart?: number;
        relay?: boolean;
      };
      if (typeof restart === 'number' && restart < this.iceGen) return;
      // Remote side escalated: sync the generation and join them.
      if (relay === true && typeof restart === 'number') {
        this.joinRemoteEscalation(restart);
      }
      if (!this.pc.remoteDescription) {
        // Early candidates (racing the offer) are buffered, not dropped.
        if (this.pendingIce.length < 200)
          this.pendingIce.push(...(candidates ?? []));
        return;
      }
      for (const c of candidates ?? []) {
        try {
          await this.pc.addIceCandidate(c);
        } catch {
          if (!this.ignoreOffer) throw new Error('addIceCandidate failed');
        }
      }
    }
  }

  close(): void {
    for (const t of [
      this.iceTimer,
      this.escalateTimer,
      this.disconnectTimer,
      this.restartWatch,
      this.turnRetry,
      this.remoteAskTimer,
    ]) {
      if (t) clearTimeout(t);
    }
    try {
      this.ctl?.close();
      this.pc.close();
    } catch {
      /* already closed */
    }
  }
}
