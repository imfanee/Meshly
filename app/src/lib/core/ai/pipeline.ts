/**
 * Transcription pipeline (doc 06 s.6): one MediaRecorder per included
 * audio track producing ~20 s standalone segments, an AnalyserNode RMS
 * gate that discards >95% silent segments, an upload queue (concurrency
 * 2, 3 retries with backoff), and attributed transcript lines.
 */

export interface TranscriptLine {
  speaker: string;
  ts: number;
  text: string;
}

export type TranscribeFn = (blob: Blob) => Promise<string>;

interface TrackTap {
  stream: MediaStream;
  name: string;
  recorder: MediaRecorder;
  audioCtx: AudioContext;
  src: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  speechMs: number;
  segStart: number;
  timer: ReturnType<typeof setInterval>;
  rmsTimer?: ReturnType<typeof setInterval>;
}

interface QueueItem {
  speaker: string;
  ts: number;
  blob: Blob;
  tries: number;
}

const SEGMENT_MS = 20_000;
const RMS_THRESHOLD = 0.015;
const MAX_TRIES = 3;

export class NotesPipeline {
  lines: TranscriptLine[] = [];
  onLines: (() => void) | null = null;
  private taps = new Map<string, TrackTap>();
  private queue: QueueItem[] = [];
  private running = 0;
  private disposed = false;

  constructor(private transcribe: TranscribeFn) {}

  /** Include an audio track (own mic or a consented peer's). */
  addTrack(peerId: string, name: string, stream: MediaStream): void {
    if (this.taps.has(peerId) || this.disposed) return;
    // Audio-only stream: MediaRecorder with an audio mime would reject a
    // stream that also carries video.
    const audio = new MediaStream(stream.getAudioTracks());
    if (audio.getAudioTracks().length === 0) return;
    const audioCtx = new AudioContext();
    void audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(audio);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);

    const tap: TrackTap = {
      stream: audio,
      name,
      audioCtx,
      src,
      analyser,
      speechMs: 0,
      segStart: Date.now(),
      recorder: new MediaRecorder(audio, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : '',
      }),
      timer: setInterval(() => {}, SEGMENT_MS),
    };
    clearInterval(tap.timer);

    const rms = new Float32Array(analyser.fftSize);
    // Standalone segments per doc 06: stop() flushes a complete file and
    // onstop restarts the next one. Do NOT pass a timeslice to start().
    tap.recorder.ondataavailable = (e) => {
      const segMs = Date.now() - tap.segStart;
      const speechFrac = segMs > 0 ? tap.speechMs / segMs : 0;
      tap.speechMs = 0;
      // Discard segments that were over 95% silent. If the AudioContext
      // could not resume (autoplay policy), the RMS gate is unreliable so
      // segments are kept rather than wrongly dropped.
      const gateLive = tap.audioCtx.state === 'running';
      if (e.data.size > 0 && (!gateLive || speechFrac > 0.05)) {
        this.enqueue({
          speaker: tap.name,
          ts: tap.segStart,
          blob: e.data,
          tries: 0,
        });
      }
    };
    tap.recorder.onstop = () => {
      tap.segStart = Date.now();
      if (this.taps.has(peerId) && tap.recorder.state === 'inactive') {
        tap.recorder.start();
      }
    };
    // RMS sampler for the silence gate (100 ms ticks).
    tap.rmsTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(rms);
      let sum = 0;
      for (let i = 0; i < rms.length; i += 4) sum += rms[i] * rms[i];
      if (Math.sqrt(sum / (rms.length / 4)) > RMS_THRESHOLD)
        tap.speechMs += 100;
    }, 100);
    // Segment clock: stop() flushes a complete file every SEGMENT_MS.
    tap.timer = setInterval(() => {
      if (tap.recorder.state === 'recording') tap.recorder.stop();
    }, SEGMENT_MS);
    tap.recorder.start();
    this.taps.set(peerId, tap);
  }

  removeTrack(peerId: string): void {
    const tap = this.taps.get(peerId);
    if (!tap) return;
    this.taps.delete(peerId);
    clearInterval(tap.timer);
    if (tap.rmsTimer) clearInterval(tap.rmsTimer);
    tap.recorder.stop();
    tap.src.disconnect();
    void tap.audioCtx.close();
  }

  private enqueue(item: QueueItem): void {
    this.queue.push(item);
    this.pump();
  }

  private pump(): void {
    while (this.running < 2 && this.queue.length) {
      const item = this.queue.shift()!;
      this.running += 1;
      this.transcribe(item.blob)
        .then((text) => {
          const t = text.trim();
          if (t) {
            this.lines.push({ speaker: item.speaker, ts: item.ts, text: t });
            this.lines.sort((a, b) => a.ts - b.ts);
            this.onLines?.();
          }
        })
        .catch(async () => {
          item.tries += 1;
          if (item.tries < MAX_TRIES) {
            await new Promise((r) => setTimeout(r, 1_000 * 2 ** item.tries));
            this.queue.push(item);
          } else {
            this.onError?.(item);
          }
        })
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }

  onError: ((item: QueueItem) => void) | null = null;

  /** Transcript as a readable string for the summary prompt / export. */
  transcript(): string {
    return this.lines
      .map(
        (l) =>
          `${l.speaker} [${new Date(l.ts).toLocaleTimeString('en-GB')}]: ${l.text}`,
      )
      .join('\n');
  }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.taps.keys()]) this.removeTrack(id);
    this.queue.length = 0;
  }
}
