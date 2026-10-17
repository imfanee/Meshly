/**
 * One peer connection, doc 04 section 1: W3C perfect negotiation,
 * sendrecv audio + video transceivers created by the offerer in a fixed
 * order (mid 0 audio, mid 1 camera), a `ctl` data channel, and ICE
 * candidate batching (300 ms or 10 candidates) onto the signalling hub.
 */

import type { Envelope } from '../signalling/envelope';

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
}

const ICE_BATCH_MS = 300;
const ICE_BATCH_MAX = 10;

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

  constructor(
    readonly peerId: string,
    selfId: string,
    private events: PeerEvents,
    iceServers: RTCIceServer[],
    private isOfferer: boolean,
  ) {
    this.polite = selfId > peerId;
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onnegotiationneeded = () => void this.negotiate();
    this.pc.onicecandidate = (e) => this.bufferCandidate(e.candidate);
    this.pc.onicecandidateerror = () => undefined;
    this.pc.onconnectionstatechange = () =>
      this.events.onConnectionState?.(this.peerId, this.pc.connectionState);
    this.pc.oniceconnectionstatechange = () =>
      this.events.onIceState?.(this.peerId, this.pc.iceConnectionState);
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
      const { candidates, restart } = env.b as {
        candidates?: RTCIceCandidateInit[];
        restart?: number;
      };
      if (typeof restart === 'number' && restart < this.iceGen) return;
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
    if (this.iceTimer) clearTimeout(this.iceTimer);
    try {
      this.ctl?.close();
      this.pc.close();
    } catch {
      /* already closed */
    }
  }
}
