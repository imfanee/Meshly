# ADR 0005: Svelte 5, TypeScript, Vite, Tailwind

**Status:** Accepted (2026-10-17)

## Context

The app must be small (fast first load on phones), easy for an AI agent to build consistently, and maintainable by one person.

## Decision

- Svelte 5 (runes) for UI: compiled, tiny runtime, simple reactivity.
- TypeScript strict; core logic in framework-free modules under `src/lib/core/`.
- Vite with `vite-plugin-pwa` for build and service worker; output to `../web`.
- Tailwind CSS v4 with design tokens as CSS variables; `lucide-svelte` icons; self-hosted Inter.
- Vitest and Playwright for tests.
- No UI component library; a small in-house set built to the doc 05 spec.

## Consequences

- Initial JS budget of 250 KB gzipped is realistic.
- Svelte 5 is newer than React in agent training data; the agent must follow current Svelte 5 docs (runes, not legacy stores) and verify APIs.
