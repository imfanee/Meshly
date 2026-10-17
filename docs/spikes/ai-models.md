# Spike T0.5: AI provider model IDs and browser CORS

Date: 2026-10-17. Sources: provider documentation plus live unauthenticated probes from this machine (curl OPTIONS and POST with `Origin: https://meshly.example.com`). Model IDs go stale quickly; Settings keeps every model field editable per doc 06.

## Defaults to ship

| Provider | Transcription default | Summary default | Notes |
| --- | --- | --- | --- |
| OpenAI | `gpt-transcribe` | `gpt-5-mini` | `/v1/audio/transcriptions`, `/v1/chat/completions` |
| Anthropic | none | `claude-haiku-5-5` | `/v1/messages`; `claude-sonnet-5-5` as the upgrade |
| Gemini | `gemini-3.5-transcribe` or audio part in generateContent | `gemini-3.1-flash-lite` | `gemini-3.8-flash` as the upgrade |
| OpenAI-compatible (Groq) | `whisper-large-v3-turbo` | `openai/gpt-oss-20b` | base `https://api.groq.com/openai/v1` |
| OpenAI-compatible (OpenRouter) | none | user-chosen, for example `openai/gpt-5-mini` | base `https://openrouter.ai/api/v1` |

## Model findings

- **OpenAI** now recommends `gpt-transcribe` for file transcription. `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` and `gpt-4o-transcribe-diarize` are deprecated and removed on 2027-02-26, so none of them may be the shipped default. For summaries, `gpt-5-mini` ($0.25/$2 per MTok) is the cheap, well-defined-task model; `gpt-5.6-terra` and `gpt-5.6-sol` are the newer mini and flagship tiers if users want better quality.
- **Anthropic**: `claude-haiku-5-5` exists (cheap, fast, 1M context) and matches the doc-06 suggested default; `claude-sonnet-5-5` is the step up. No transcription endpoint, consistent with doc 06.
- **Gemini**: current stable flash family is 3.x (`gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.1-flash-lite`); `gemini-3.1-flash-lite` is cheapest and has a free tier, a good default for summaries. `gemini-3.5-transcribe` is a dedicated transcription model; audio can also go inline in `generateContent` as doc 06 assumes.
- **Groq**: `whisper-large-v3` and `whisper-large-v3-turbo` (turbo is about half the cost per audio hour and the right default). Llama chat IDs churned again: `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` were deprecated for free/developer tiers on 2026-08-16; Groq now recommends `openai/gpt-oss-120b` and `openai/gpt-oss-20b`.

## CORS probe results (unauthenticated)

| Endpoint | OPTIONS preflight | POST response carries `access-control-allow-origin` | Verdict |
| --- | --- | --- | --- |
| `api.openai.com/v1/audio/transcriptions` | 200, echoes origin, allows `authorization,content-type` | `*` on 401 | browser OK |
| `api.openai.com/v1/chat/completions` | 200 | `*` on 401 | browser OK |
| `api.anthropic.com/v1/messages` | 200, `*`, allows `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access` | `*` on 401 | browser OK with the direct-browser-access header |
| `generativelanguage.googleapis.com/.../gemini-3.1-flash-lite:generateContent` | 200 when only `content-type,x-goog-api-key` are requested; 403 if unrelated headers are included | echoes origin | browser OK; adapter must send only the two headers |
| `api.groq.com/openai/v1/...` | 204, `*` | `*` on 401 | browser OK |
| `openrouter.ai/api/v1/chat/completions` | 204, `*` | `*` on 401 | browser OK |

## Implications for the adapters (T4.1)

- Every planned provider can be called directly from the Meshly origin; no proxy needed, consistent with "no backend of our own".
- Gemini requests must contain only `Content-Type` and `x-goog-api-key` headers; anything extra trips the preflight.
- Anthropic adapters must always send `anthropic-dangerous-direct-browser-access: true` and `anthropic-version`.
- Model IDs are the most perishable facts in this document; re-run this check before each release (the provider `/models` endpoints can diff cheaply).
