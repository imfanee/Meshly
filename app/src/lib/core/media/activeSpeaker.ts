/**
 * Active speaker detection, doc 04 section 7: one shared AudioContext, one
 * AnalyserNode per remote audio track, RMS every 100 ms, a 300 ms threshold
 * hold before switching, and a 1.5 s dwell before releasing. Also exposes the
 * local mic level for PreJoin and the muted-speaking hint.
 */

const RMS_INTERVAL_MS = 100;
const SPEAK_THRESHOLD = 0.02;
const SPEAK_HOLD_MS = 300;
const DWELL_MS = 1500;

export class ActiveSpeaker {
  private ctx: AudioContext | null = null;
  private analysers = new Map<
    string,
    {
      node: AnalyserNode;
      src: MediaStreamAudioSourceNode;
      buf: Float32Array<ArrayBuffer>;
    }
  >();
  private levels = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private candidate: { id: string; since: number } | null = null;
  private lastSwitch = 0;
  /** Highest-volume speaking peer, or null. Read by UI via subscribe. */
  active: string | null = null;
  micLevel = 0;
  private localAnalyser: AnalyserNode | null = null;
  private localBuf: Float32Array<ArrayBuffer> | null = null;
  private subs = new Set<() => void>();

  subscribe(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private emit(): void {
    for (const cb of this.subs) cb();
  }

  private ensureCtx(): AudioContext | null {
    try {
      this.ctx ??= new AudioContext();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Start analysing a peer's remote audio track. */
  watch(peerId: string, stream: MediaStream): void {
    const ctx = this.ensureCtx();
    const track = stream.getAudioTracks()[0];
    if (!ctx || !track || this.analysers.has(peerId)) return;
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const node = ctx.createAnalyser();
    node.fftSize = 512;
    src.connect(node);
    this.analysers.set(peerId, {
      node,
      src,
      buf: new Float32Array(node.fftSize),
    });
    this.startLoop();
  }

  unwatch(peerId: string): void {
    const a = this.analysers.get(peerId);
    if (a) {
      a.src.disconnect();
      a.node.disconnect();
      this.analysers.delete(peerId);
      this.levels.delete(peerId);
    }
    if (this.active === peerId) this.active = null;
  }

  /** Analyse the local mic (PreJoin meter, muted-speaking hint). */
  watchLocal(stream: MediaStream | null): void {
    const ctx = this.ensureCtx();
    this.localAnalyser?.disconnect();
    this.localAnalyser = null;
    if (!ctx || !stream || stream.getAudioTracks().length === 0) return;
    const src = ctx.createMediaStreamSource(
      new MediaStream([stream.getAudioTracks()[0]]),
    );
    const node = ctx.createAnalyser();
    node.fftSize = 512;
    src.connect(node);
    this.localAnalyser = node;
    this.localBuf = new Float32Array(node.fftSize);
    this.startLoop();
  }

  private startLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample(), RMS_INTERVAL_MS);
  }

  private rms(node: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
    node.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  private sample(): void {
    const now = Date.now();
    if (this.localAnalyser && this.localBuf) {
      const l = this.rms(this.localAnalyser, this.localBuf);
      if (Math.abs(l - this.micLevel) > 0.01) {
        this.micLevel = l;
        this.emit();
      }
    }
    let best: { id: string; rms: number } | null = null;
    for (const [id, a] of this.analysers) {
      const r = this.rms(a.node, a.buf);
      this.levels.set(id, r);
      if (r > SPEAK_THRESHOLD && (!best || r > best.rms)) {
        best = { id, rms: r };
      }
    }
    if (best) {
      if (this.candidate?.id !== best.id) {
        this.candidate = { id: best.id, since: now };
      } else if (
        now - this.candidate.since >= SPEAK_HOLD_MS &&
        this.active !== best.id &&
        now - this.lastSwitch >= DWELL_MS
      ) {
        this.active = best.id;
        this.lastSwitch = now;
        this.emit();
      }
    } else {
      this.candidate = null;
      if (this.active && now - this.lastSwitch >= DWELL_MS) {
        this.active = null;
        this.emit();
      }
    }
  }

  isSpeaking(peerId: string): boolean {
    return (this.levels.get(peerId) ?? 0) > SPEAK_THRESHOLD;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const id of [...this.analysers.keys()]) this.unwatch(id);
    this.localAnalyser?.disconnect();
    this.localAnalyser = null;
    this.active = null;
    this.candidate = null;
  }
}

export const activeSpeaker = new ActiveSpeaker();
