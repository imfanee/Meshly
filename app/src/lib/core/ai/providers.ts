/**
 * AI provider presets (doc 06 s.6 + the T0.5 spike + research decision C).
 * 'local' runs transcription (Moonshine) and summaries (Transformers.js)
 * in the browser; the others call the user's own endpoint/key. Model IDs
 * are the most perishable facts — fields stay editable per doc 06.
 */

import type { AiProvider } from '../../stores/settings.svelte';

export interface ProviderPreset {
  label: string;
  /** Empty for local; OpenAI-compatible base for the rest. */
  baseUrl: string;
  summaryModel: string;
  transcribeModel: string;
  needsKey: boolean;
  note?: string;
}

export const AI_PROVIDERS: Record<AiProvider, ProviderPreset> = {
  local: {
    label: 'On this device (private, free)',
    baseUrl: '',
    summaryModel: 'onnx-community/Qwen3.5-0.8B-ONNX',
    transcribeModel: 'onnx-community/moonshine-base-ONNX',
    needsKey: false,
    note: 'Runs in your browser; downloads ~300 MB of models on first use.',
  },
  groq: {
    label: 'Groq (free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    summaryModel: 'openai/gpt-oss-20b',
    transcribeModel: 'whisper-large-v3-turbo',
    needsKey: true,
  },
  gemini: {
    label: 'Gemini AI Studio (free tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    summaryModel: 'gemini-3.1-flash-lite',
    transcribeModel: '',
    needsKey: true,
    note: 'Free-tier prompts may be used to improve Google products.',
  },
  'openai-compat': {
    label: 'OpenAI-compatible',
    baseUrl: 'https://api.openai.com/v1',
    summaryModel: 'gpt-5-mini',
    transcribeModel: 'gpt-transcribe',
    needsKey: true,
  },
};

export function presetOf(p: AiProvider): ProviderPreset {
  return AI_PROVIDERS[p] ?? AI_PROVIDERS.local;
}
