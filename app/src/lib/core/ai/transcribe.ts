/**
 * Transcription adapters (doc 06 s.6). 'local' runs Moonshine in a Web
 * Worker via transformers.js (lazy, ~200 MB model download on first
 * use, cached by the browser) so inference never blocks the call UI.
 * BYOK providers POST the segment to their OpenAI-compatible
 * /audio/transcriptions endpoint.
 */

import { settings } from '../../stores/settings.svelte';
import { presetOf } from './providers';

export interface TranscribeResult {
  text: string;
}

/** Notified while the local model downloads/loads (first use). */
export let onLocalModelStatus: ((loading: boolean) => void) | null = null;
export function setLocalModelStatus(cb: (loading: boolean) => void): void {
  onLocalModelStatus = cb;
}

interface OutMsg {
  id: number;
  kind: 'loading' | 'loaded' | 'result' | 'error';
  text?: string;
  error?: string;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { res: (v: string) => void; rej: (e: Error) => void }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./asr.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (e: MessageEvent) => {
    const { id, kind, text, error } = e.data as OutMsg;
    if (kind === 'loading') {
      onLocalModelStatus?.(true);
      return;
    }
    if (kind === 'loaded' || kind === 'error') onLocalModelStatus?.(false);
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (kind === 'error') p.rej(new Error(error));
    else p.res(text ?? '');
  };
  return worker;
}

function call(msg: object, transfer?: Transferable[]): Promise<string> {
  const w = ensureWorker();
  const id = ++seq;
  return new Promise<string>((res, rej) => {
    pending.set(id, { res, rej });
    w.postMessage({ id, ...msg }, transfer ?? []);
  });
}

let modelReady: Promise<string> | null = null;

async function localTranscribe(blob: Blob): Promise<string> {
  // Only honour a user override that looks like a HF repo id; a stale
  // BYOK model name (for example whisper-large-v3-turbo) must not be
  // used here.
  const override = settings.aiTranscribeModel;
  const model = override?.includes('/')
    ? override
    : presetOf('local').transcribeModel;
  modelReady ??= call({ kind: 'load', model }).catch((e: Error) => {
    modelReady = null;
    console.warn('local ASR model failed to load', e);
    throw e;
  });
  await modelReady;
  const audio = await decodeTo16k(blob);
  return call({ kind: 'transcribe', audio }, [audio.buffer]);
}

async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const target = Math.ceil((buf.duration * 16000) | 0);
  const octx = new OfflineAudioContext(1, Math.max(1, target), 16000);
  const src = octx.createBufferSource();
  src.buffer = buf;
  src.connect(octx.destination);
  src.start();
  const rendered = await octx.startRendering();
  return rendered.getChannelData(0).slice(0);
}

/** Transcribe a 20 s webm/opus segment per the configured provider. */
export async function transcribeBlob(blob: Blob): Promise<string> {
  const p = settings.aiProvider;
  if (p === 'local') return localTranscribe(blob);

  const base = (settings.aiBaseUrl || presetOf(p).baseUrl).replace(/\/+$/, '');
  const model = settings.aiTranscribeModel || presetOf(p).transcribeModel;
  if (!model) throw new Error('provider has no transcription endpoint');
  const form = new FormData();
  form.append('file', blob, 'segment.webm');
  form.append('model', model);
  const r = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${settings.aiKey}` },
    body: form,
  });
  if (!r.ok) {
    throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  }
  const j = (await r.json()) as TranscribeResult;
  return j.text ?? '';
}
