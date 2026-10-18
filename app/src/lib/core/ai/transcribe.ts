/**
 * Transcription adapters (doc 06 s.6). 'local' runs Moonshine in the
 * browser via transformers.js (dynamic import, ~40-150 MB model download
 * on first use, cached by the browser). BYOK providers POST the segment
 * to their OpenAI-compatible /audio/transcriptions endpoint.
 */

import { settings } from '../../stores/settings.svelte';
import { presetOf } from './providers';

export interface TranscribeResult {
  text: string;
}

let localPipe: ((a: unknown) => Promise<unknown>) | null = null;
let pipeLoading: Promise<unknown> | null = null;
/** Notified while the local model downloads/loads (first use, ~200 MB). */
export let onLocalModelStatus: ((loading: boolean) => void) | null = null;
export function setLocalModelStatus(cb: (loading: boolean) => void): void {
  onLocalModelStatus = cb;
}

async function localTranscribe(blob: Blob): Promise<string> {
  if (!localPipe) {
    // Only honour a user override that looks like a HF repo id; a stale
    // BYOK model name (for example whisper-large-v3-turbo) must not be
    // used here.
    const override = settings.aiTranscribeModel;
    const model = override?.includes('/')
      ? override
      : presetOf('local').transcribeModel;
    onLocalModelStatus?.(true);
    pipeLoading ??= (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return pipeline('automatic-speech-recognition', model, { dtype: 'q4' });
    })();
    try {
      localPipe = (await pipeLoading) as typeof localPipe;
    } catch (e) {
      // A failed load must not poison later attempts.
      pipeLoading = null;
      console.warn('local ASR model failed to load', e);
      throw e;
    } finally {
      onLocalModelStatus?.(false);
    }
  }
  // Moonshine wants 16 kHz PCM; decode the segment and resample.
  const audio = await decodeTo16k(blob);
  const out = (await localPipe!(audio)) as
    { text?: string } | { text?: string }[];
  return Array.isArray(out) ? (out[0]?.text ?? '') : (out?.text ?? '');
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
