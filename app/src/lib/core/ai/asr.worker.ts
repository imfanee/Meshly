/**
 * Local ASR worker (doc 06 s.6): runs Moonshine via transformers.js off
 * the main thread so inference does not freeze the call UI. The model
 * downloads on first use (~200 MB) and is cached by the browser.
 */
import { pipeline } from '@huggingface/transformers';

interface InMsg {
  id: number;
  kind: 'load' | 'transcribe';
  model?: string;
  audio?: Float32Array;
}

type Asr = (
  a: Float32Array,
) => Promise<{ text?: string } | { text?: string }[]>;

let asr: Asr | null = null;
let loading: Promise<Asr> | null = null;

async function ensure(model: string): Promise<Asr> {
  loading ??= pipeline('automatic-speech-recognition', model, {
    dtype: 'q4',
  }) as Promise<Asr>;
  try {
    asr = await loading;
    return asr;
  } catch (e) {
    // A failed load must not poison later attempts.
    loading = null;
    throw e;
  }
}

self.onmessage = (e: MessageEvent) => {
  const { id, kind, model, audio } = e.data as InMsg;
  void (async () => {
    try {
      if (kind === 'load') {
        postMessage({ id, kind: 'loading' });
        await ensure(model!);
        postMessage({ id, kind: 'loaded' });
      } else {
        const out = await asr!(audio!);
        const text = Array.isArray(out) ? out[0]?.text : out?.text;
        postMessage({ id, kind: 'result', text: text ?? '' });
      }
    } catch (err) {
      postMessage({
        id,
        kind: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
};
