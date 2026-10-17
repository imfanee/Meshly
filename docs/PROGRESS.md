# Progress log

Newest entries first. One entry per completed task, deploy or notable decision. Never include IP addresses, usernames, keys or other secrets.

Format:

```
## YYYY-MM-DD: <task ID> <short title>
- Changed: ...
- Verified: ...
- Open: ...
- Commit: <hash>
```

## 2026-10-17: T0.3 Spike: Nostr relays

- Changed: added `app/tools/spike-nostr.mjs` (two connections per relay, 20 kind-25050 events, measures OK acks, delivery and latency); results and decision in `docs/spikes/nostr.md`; `VITE_NOSTR_RELAYS` updated in `.env.example`, `app/.env` and `app/.env.production`.
- Verified: 8 candidates probed. Kept relay.primal.net, nos.lol, nostr.mom (20/20, median 137 to 152 ms) and nostr.oxtr.dev (rate-limited only above its threshold; our test burst exceeds the app's 10/s cap). Dropped damus (rejects kind 25050), nostr.band and nostr.bg (connectivity), offchain.pub (loss, 333 ms median).
- Open: none.
- Commit: pending

## 2026-10-17: T0.2 Scaffold app

- Changed: created `app/` with Vite 8 + Svelte 5.57 + TypeScript 6 strict; `build.outDir: '../web'`, `emptyOutDir: true`; Tailwind v4 via `@tailwindcss/vite` with doc-05 design tokens bound through `@theme inline`; ESLint 10 flat config (tseslint + eslint-plugin-svelte + prettier), Prettier + svelte-check; Vitest 5 (own `vitest.config.ts`, node env); Playwright 1.64 (Chromium with fake-media flags, builds then previews); `vite-plugin-pwa` 2 (`registerType: 'prompt'`, manifest per doc 05 section 6); `scripts/copy-infra.mjs` prebuild copying `infra/cpanel/.htaccess`, `assets.htaccess`, `api/turn.php` and the Inter woff2 from `@fontsource-variable/inter` into `public/`; `src/config.ts` reading all `VITE_*` env with fallbacks; `app/.env` (dev, git-ignored) and `app/.env.production` (tracked, public values only); npm scripts `dev`, `build`, `preview`, `check`, `test`, `test:e2e`, `deploy`, `deploy:dry`; mesh-mark `logo.svg`; minimal `App.svelte` placeholder pending T1.1.
- Verified: `npm run check` clean (svelte-check, tsc, eslint, prettier); `npm run test` 2/2; `npm run build` produces `web/index.html`, `web/.htaccess`, `web/assets/.htaccess`, `web/api/turn.php`, `web/fonts/InterVariable.woff2`, manifest and sw.js; `npm run test:e2e` 1/1 (Chromium + OS deps installed via playwright install-deps); initial JS 12.7 KB gzipped.
- Decisions: used `@lucide/svelte` (the `lucide-svelte` package is deprecated upstream and redirects there); `deploy.mjs` is a safe stub until T1.11; `web/` and generated `public/` copies are git-ignored so `infra/` stays the source of truth.
- Open: real PWA icons, og.png and sounds arrive in T1.2 (manifest already references them); open questions 1 to 7.
- Commit: pending

## 2026-10-17: T0.1 Environment check

- Changed: installed Node.js v24.22.0 (active LTS "Krypton", satisfies "LTS 22+") to /usr/local from the official tarball with SHA-256 verification; npm 11.19.1 included. Confirmed `agent/commands/*.md` already mirrored into `.claude/commands/` (identical), so `/next-task`, `/status`, `/deploy-web`, `/setup-turn` are available.
- Verified: node v24.22.0, npm 11.19.1, git 2.47.3, OpenSSH 10.0p2, scp (OpenSSH), tar/xz/curl present. OS: Debian 13 (trixie) x86_64, kernel 6.12.
- Note: this environment is Linux at `/root/Meshly`, not the Windows path `D:\Reposetories\Meshly` assumed in AGENTS.md. PowerShell-specific steps (for example `icacls`) do not apply here; key permissions use `chmod 600` instead. Removed the stray `t0.1-env-check.ps1` scratch script (Windows-only, superseded by this check).
- Open: ~960 MB RAM on this VM; large npm installs and Vite builds may be tight. Open questions 1 to 7 in docs/11-ROADMAP-TASKS.md.
- Commit: pending

## 2026-10-17: Project specification

- Changed: README, AGENTS.md, CLAUDE.md, docs 01 to 11, ADRs 0001 to 0008, cPanel and TURN infrastructure files created by the architect's assistant.
- Verified: shell scripts pass `bash -n`; `turn.php` passes `php -l`; docs reviewed for consistency.
- Open: open questions 1 to 7 in docs/11-ROADMAP-TASKS.md.
- Next: T0.1 Environment check.
