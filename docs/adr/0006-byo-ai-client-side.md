# ADR 0006: Bring-your-own-key AI, client-side, opt-in per participant

**Status:** Accepted (2026-10-17)

## Context

Users want AI notes and summaries without Meshly paying for or proxying AI calls, and without a backend that could see meeting audio.

## Decision

- Any participant can configure their own provider key (OpenAI, Anthropic, Google Gemini, OpenAI-compatible, later local Whisper). Calls go directly from their browser to the provider.
- The note-taker transcribes the separate audio tracks they already receive in the mesh, giving speaker attribution without other participants needing keys.
- Each other participant must explicitly allow transcription of their voice; no answer means no.
- Keys stay on the device (memory, or IndexedDB if the user ticks "remember").

## Consequences

- Zero AI cost to the service; privacy boundary is clear (user's own provider terms).
- Keys in the browser are exposed to any XSS; mitigated by strict CSP and no third-party scripts (doc 07).
- Transcription quality and cost depend on the user's provider; model IDs must stay editable.
