/**
 * Local media acquisition and control, doc 04 section 2. Owns the mic/camera
 * tracks; PeerManager applies them via replaceTrack so toggles never need
 * renegotiation.
 */

export interface MediaSnapshot {
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
  stream: MediaStream | null;
  facingMode: 'user' | 'environment';
}

const AUDIO: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

const VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: 'user',
};

export class LocalMedia {
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private stream: MediaStream | null = null;
  private facing: 'user' | 'environment' = 'user';
  private audioDevice: string | null = null;
  private videoDevice: string | null = null;
  private onChangeCbs = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.onChangeCbs.add(cb);
    return () => this.onChangeCbs.delete(cb);
  }

  private emit(): void {
    for (const cb of this.onChangeCbs) cb();
  }

  snapshot(): MediaSnapshot {
    return {
      audio: this.audioTrack,
      video: this.videoTrack,
      stream: this.stream,
      facingMode: this.facing,
    };
  }

  async acquire(wantMic: boolean, wantCam: boolean): Promise<void> {
    // Reuse the existing stream when the request matches what we hold.
    if (
      this.stream &&
      wantMic === !!this.audioTrack &&
      wantCam === !!this.videoTrack
    ) {
      return;
    }
    if (!wantMic && !wantCam) {
      this.stream = new MediaStream();
      this.emit();
      return;
    }
    const s = await navigator.mediaDevices.getUserMedia({
      audio: wantMic
        ? {
            ...AUDIO,
            ...(this.audioDevice
              ? { deviceId: { exact: this.audioDevice } }
              : {}),
          }
        : false,
      video: wantCam
        ? {
            ...VIDEO,
            facingMode: this.facing,
            ...(this.videoDevice
              ? { deviceId: { exact: this.videoDevice } }
              : {}),
          }
        : false,
    });
    this.audioTrack = s.getAudioTracks()[0] ?? null;
    this.videoTrack = s.getVideoTracks()[0] ?? null;
    this.stream = s;
    this.emit();
  }

  async setMic(on: boolean): Promise<void> {
    if (on) {
      if (!this.audioTrack) {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...AUDIO,
            ...(this.audioDevice
              ? { deviceId: { exact: this.audioDevice } }
              : {}),
          },
        });
        this.audioTrack = s.getAudioTracks()[0] ?? null;
        if (this.audioTrack && this.stream)
          this.stream.addTrack(this.audioTrack);
      }
      if (this.audioTrack) this.audioTrack.enabled = true;
    } else {
      // Muted track stays bound to senders; enabled=false stops audio.
      if (this.audioTrack) this.audioTrack.enabled = false;
    }
    this.emit();
  }

  async setCam(on: boolean): Promise<void> {
    if (on) {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          ...VIDEO,
          facingMode: this.facing,
          ...(this.videoDevice
            ? { deviceId: { exact: this.videoDevice } }
            : {}),
        },
      });
      this.videoTrack?.stop();
      this.videoTrack = s.getVideoTracks()[0] ?? null;
      if (this.videoTrack && this.stream) this.stream.addTrack(this.videoTrack);
    } else {
      this.videoTrack?.stop();
      if (this.videoTrack && this.stream)
        this.stream.removeTrack(this.videoTrack);
      this.videoTrack = null;
    }
    this.emit();
  }

  /** Toggle front/back camera (mobile). */
  async flipCamera(): Promise<void> {
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    this.videoDevice = null;
    if (this.videoTrack) await this.setCam(true);
  }

  async switchAudioDevice(deviceId: string): Promise<void> {
    this.audioDevice = deviceId;
    this.audioTrack?.stop();
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { ...AUDIO, deviceId: { exact: deviceId } },
    });
    const t = s.getAudioTracks()[0] ?? null;
    if (this.stream && this.audioTrack)
      this.stream.removeTrack(this.audioTrack);
    this.audioTrack = t;
    if (t && this.stream) this.stream.addTrack(t);
    this.emit();
  }

  async switchVideoDevice(deviceId: string): Promise<void> {
    this.videoDevice = deviceId;
    if (this.videoTrack) await this.setCam(true);
  }

  async listDevices(): Promise<MediaDeviceInfo[]> {
    return navigator.mediaDevices.enumerateDevices();
  }

  stopAll(): void {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.audioTrack = null;
    this.videoTrack = null;
    this.stream = null;
    this.emit();
  }
}

/** Shared instance used by session/PreJoin/Call. */
export const localMedia = new LocalMedia();
