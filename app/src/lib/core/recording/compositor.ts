/**
 * Meshly recording compositor and mixer (doc 06 s.5).
 *
 * A 1280x720 canvas redrawn at 25 fps by a Web Worker ticker (worker timers
 * are not throttled when the tab hides). Layout mirrors the doc 05 grid
 * rules: up to 6 video tiles, avatar + initials for audio-only, name labels,
 * speaking ring; a screen share takes the left ~75% with cameras stacked
 * right. Audio from every participant (local mic + remote tracks) is mixed
 * through a MediaStreamAudioDestinationNode.
 *
 * `getStream()` returns captureStream(25) plus the mixed audio for
 * MediaRecorder in T3.2.
 */

export interface CompositeSource {
  peerId: string;
  name: string;
  stream: MediaStream | null;
  /** Live video track to draw, or null for an audio-only tile. */
  video: MediaStreamTrack | null;
  speaking: boolean;
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worker: Worker;
  private audioCtx = new AudioContext();
  private dest = this.audioCtx.createMediaStreamDestination();
  private sources = new Map<string, { src: MediaStreamAudioSourceNode }>();
  private videos = new Map<string, HTMLVideoElement>();
  private frames = 0;
  private disposed = false;

  constructor(
    private getSources: () => CompositeSource[],
    private screenOf: () => { name: string; stream: MediaStream } | null,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d')!;
    this.worker = new Worker(new URL('./ticker.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = () => this.tick();
    this.audioCtx.resume().catch(() => undefined);
  }

  /** Frames drawn so far (e2e fps assertion). */
  get frameCount(): number {
    return this.frames;
  }

  /** Output for MediaRecorder: composited video + mixed audio. */
  getStream(): MediaStream {
    const out = new MediaStream();
    for (const t of this.canvas.captureStream(25).getVideoTracks()) {
      out.addTrack(t);
    }
    for (const t of this.dest.stream.getAudioTracks()) out.addTrack(t);
    return out;
  }

  private tick(): void {
    if (this.disposed) return;
    this.frames += 1;
    const sources = this.getSources();
    const screen = this.screenOf();
    this.syncAudio(sources);
    this.draw(sources, screen);
  }

  private syncAudio(sources: CompositeSource[]): void {
    const seen = new Set<string>();
    for (const s of sources) {
      const track = s.stream?.getAudioTracks()[0];
      if (!track || track.readyState !== 'live') continue;
      seen.add(s.peerId);
      if (!this.sources.has(s.peerId)) {
        try {
          const src = this.audioCtx.createMediaStreamSource(
            new MediaStream([track]),
          );
          src.connect(this.dest);
          this.sources.set(s.peerId, { src });
        } catch {
          /* track ended between check and connect */
        }
      }
    }
    for (const [id, s] of this.sources) {
      if (!seen.has(id)) {
        s.src.disconnect();
        this.sources.delete(id);
      }
    }
  }

  /** Hidden <video> elements feed the canvas (a frame grab needs a live el). */
  private videoFor(track: MediaStreamTrack): HTMLVideoElement {
    let v = this.videos.get(track.id);
    if (!v) {
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = new MediaStream([track]);
      void v.play().catch(() => undefined);
      this.videos.set(track.id, v);
    }
    return v;
  }

  private draw(
    sources: CompositeSource[],
    screen: { name: string; stream: MediaStream } | null,
  ): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#0f1a18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tiles = sources.slice(0, 6);
    const n = tiles.length;
    if (n === 0 && !screen) return;

    // Screen-share layout: share on the left ~75%, cameras stacked right.
    if (screen?.stream.getVideoTracks()[0]) {
      const sw = Math.floor(canvas.width * 0.75);
      this.drawTrack(
        ctx,
        screen.stream.getVideoTracks()[0]!,
        0,
        0,
        sw,
        720,
        'contain',
      );
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(8, 8, ctx.measureText(screen.name).width + 24, 26);
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.fillText(`${screen.name} is sharing`, 18, 27);
      tiles.forEach((s, i) => {
        const th = Math.floor(720 / Math.max(1, Math.min(3, n)));
        const y = i * th;
        this.drawTile(s, sw, y, canvas.width - sw, th);
      });
      return;
    }

    // Grid rules: 1 -> 1x1, 2 -> 2x1, 3-4 -> 2x2, 5-6 -> 3x2.
    const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const tw = canvas.width / cols;
    const th = canvas.height / rows;
    tiles.forEach((s, i) => {
      const x = (i % cols) * tw;
      const y = Math.floor(i / cols) * th;
      this.drawTile(s, x, y, tw, th);
    });
  }

  private drawTile(
    s: CompositeSource,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w - 4, h - 4);
    ctx.clip();
    ctx.fillStyle = '#1a2b28';
    ctx.fillRect(x, y, w - 4, h - 4);
    if (s.video?.readyState === 'live') {
      this.drawTrack(ctx, s.video, x, y, w - 4, h - 4, 'cover');
    } else {
      // Audio-only tile: avatar circle + initials.
      ctx.fillStyle = '#0b6b5c';
      ctx.beginPath();
      ctx.arc(x + w / 2 - 2, y + h / 2 - 12, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        s.name.slice(0, 2).toUpperCase(),
        x + w / 2 - 2,
        y + h / 2 - 4,
      );
    }
    // Name label.
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x + 6, y + h - 34, ctx.measureText(s.name).width + 20, 24);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(s.name, x + 14, y + h - 17);
    // Speaking ring.
    if (s.speaking) {
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1, y + 1, w - 6, h - 6);
    }
    ctx.restore();
  }

  private drawTrack(
    ctx: CanvasRenderingContext2D,
    track: MediaStreamTrack,
    x: number,
    y: number,
    w: number,
    h: number,
    mode: 'cover' | 'contain',
  ): void {
    const v = this.videoFor(track);
    if (v.readyState < 2 || !v.videoWidth) return;
    const va = v.videoWidth / v.videoHeight;
    const ta = w / h;
    let dw = w;
    let dh = h;
    if (mode === 'cover' ? va > ta : va < ta) dw = dh * va;
    else dh = dw / va;
    ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  dispose(): void {
    this.disposed = true;
    this.worker.terminate();
    for (const [, s] of this.sources) s.src.disconnect();
    for (const v of this.videos.values()) {
      v.srcObject = null;
      v.remove();
    }
    void this.audioCtx.close().catch(() => undefined);
  }
}
