# 11 Roadmap and tasks

Work through phases in order. Within a phase, tasks are ordered by dependency. Tick `[x]` when acceptance criteria are met (AGENTS.md section 11). Phase 5 (TURN) can run any time after T1.9, when Faisal provides Proxmox access.

Estimated effort for one agent with reviews: Phase 0 to 1 about 3 to 4 weeks of sessions; full v1.0 about 10 to 12 weeks.

## Phase 0: setup and spikes

- [x] **T0.1 Environment check.** Verify Node LTS, npm, git, ssh, scp on the Windows machine. Record versions in PROGRESS.md. Copy `agent/commands/*.md` into `.claude/commands/` (Claude Code slash commands). *Accept:* versions logged; missing tools reported to Faisal; `/next-task` available.
- [x] **T0.2 Scaffold app.** Vite + Svelte 5 + TypeScript strict in `app/`; `build.outDir: '../web'`, `emptyOutDir: true`; Tailwind v4; ESLint, Prettier, svelte-check; Vitest; Playwright; prebuild script copying `infra/cpanel/.htaccess`, `infra/cpanel/assets.htaccess` and `infra/cpanel/api/turn.php` into `app/public/`; `config.ts` reading env; npm scripts `dev`, `build`, `preview`, `check`, `test`, `test:e2e`, `deploy`, `deploy:dry`. *Accept:* `npm run build` produces `web/index.html`, `web/.htaccess`, `web/api/turn.php`; all scripts run.
- [x] **T0.3 Spike: Nostr relays.** Node script in `app/tools/spike-nostr.mjs` that publishes kind 25050 with a `t` tag to each candidate relay and subscribes from a second connection. Measure acceptance, delivery and median latency over 20 messages. *Accept:* `docs/spikes/nostr.md` with a results table; `VITE_NOSTR_RELAYS` updated to 3 to 5 relays that work.
- [x] **T0.4 Spike: MQTT brokers.** Same for candidate WSS brokers. *Accept:* `docs/spikes/mqtt.md`; `VITE_MQTT_BROKERS` updated.
- [x] **T0.5 Spike: AI model IDs and CORS.** Check current provider docs for transcription and chat model IDs and browser CORS support; test with a dummy request where possible. *Accept:* `docs/spikes/ai-models.md` with default models per provider.

## Phase 1: core meeting (MVP)

- [x] **T1.1 Design system and shell.** Tokens (doc 05), fonts, icons, base components (Button, IconButton, Input, Dialog, Sheet, Toast, Tooltip, Tabs), router (Home, PreJoin, Lobby, Call, PostCall, About, Privacy, Terms, NotFound), theme handling, footer, i18n module. *Accept:* all routes render on desktop and mobile widths; keyboard focus visible; footer credit and links correct; no em-dashes in strings.
- [x] **T1.2 PWA.** Manifest (doc 05 section 6), logo SVG and generated icons, OG image, service worker with prompt updates, install button logic for all platforms, iOS guide sheet, window-controls-overlay title bar. *Accept:* DevTools shows installable; Chrome install creates a desktop shortcut and opens borderless; offline reload shows shell; update toast appears after a rebuild.
- [x] **T1.3 Crypto and room model.** `core/crypto` and `core/room` per doc 03 sections 1 to 3 and 5; host key persistence in IndexedDB (24 h). *Accept:* unit tests in doc 10 for encoding, crypto, canonical JSON, tickets pass.
- [x] **T1.4 Signalling hub.** Envelope codec and receive pipeline; Nostr, MQTT and dev relay transports; fan-out and dedupe; rate limits; `tools/dev-relay.mjs`. *Accept:* unit tests pass; two browser tabs exchange signed encrypted messages over each transport individually.
- [x] **T1.5 Lobby and admission.** Knock, admit, deny, host-here, tickets, roster, signed room state, capacity 12, lock. Pre-join and Lobby screens wired. *Accept:* e2e create/join, deny, lock, capacity tests pass.
- [x] **T1.6 Peer manager and media.** Perfect negotiation, transceivers, local media, device switching, mobile camera flip, autoplay handling, wake lock, cleanup. *Accept:* 3-way call in e2e with video playing at all ends; device switch does not drop the call.
- [x] **T1.7 Call UI.** Grid and speaker layouts, tiles, control bar desktop and mobile, top bar, side panel shell, toasts, active speaker. *Accept:* matches doc 05; usable at 360 px wide and 1920 px wide; screen reader announces joins and leaves.
- [x] **T1.8 Chat and reactions.** `ctl` data channel protocol, chat panel, unread badge, reactions, raise hand. *Accept:* e2e chat dedupe test passes.
- [x] **T1.9 Staged ICE.** STUN-only start, escalation timer and triggers, TURN credential fetch with cache and backoff (`referrerPolicy: "same-origin"`), ICE restart, disconnected handling, relay-only mode, connection badge and debug panel. *Accept:* unit tests for the state machine pass; with TURN endpoint returning 503 the app shows the right tile message and keeps retrying.
- [x] **T1.10 Content pages.** About (architecture explainer with credit), Privacy and Terms from doc 07 drafts. *Accept:* Faisal reviews copy (gate).
- [x] **T1.11 Deploy script and first deploy.** `app/scripts/deploy.mjs` per doc 08; smoke tests. *Accept:* Faisal approves; live site passes smoke tests; two-device call works over the internet with free STUN.

## Phase 2: complete meeting experience

- [x] **T2.1 Screen sharing** (doc 06 section 3). *Accept:* e2e screen share passes; hidden on mobile.
- [x] **T2.2 Host controls:** remove, ask to mute, lower hand, end for everyone, host reload resumes host. *Accept:* e2e remove, end, host reload pass.
- [x] **T2.3 Video slots** (6 max) with slot requests and host reassignment. *Accept:* e2e video slot test passes.
- [x] **T2.4 Bitrate policy** (doc 04 section 3) and off-screen pause. *Accept:* `getStats` shows bitrates within policy at 2, 4 and 6 senders.
- [x] **T2.5 Reconnect robustness:** ICE restart on network change, peer timeout cleanup, relay reconnection. *Accept:* e2e reconnect test passes; manual Wi-Fi to 4G switch keeps the call.
- [x] **T2.6 File transfer** (doc 06 section 2). *Accept:* 50 MB file transfers between two contexts with matching SHA-256.
- [x] **T2.7 Settings dialog** complete (devices, appearance, advanced). *Accept:* all settings persist where specified.

## Phase 3: recording

- [x] **T3.1 Compositor and mixer** with worker ticker. *Accept:* preview of the composite matches the grid; runs at 25 fps while the tab is hidden for 5 minutes.
- [x] **T3.2 Recorder and sinks:** File System Access streaming (Chromium), OPFS buffer and download (others), WebM duration fix for buffered files, crash recovery offer. *Accept:* 60-minute recording on Chrome uses flat memory; Safari and Firefox produce a playable file; e2e recording test passes.
- [x] **T3.3 Recording notice:** state flag, banner and chime for all, consent dialog for host. *Accept:* every participant sees the banner within 1 s.

## Phase 4: AI notes

- [x] **T4.1 Provider adapters and Settings UI** (OpenAI, Anthropic, Gemini, OpenAI-compatible) with Test buttons and key storage options. *Accept:* each adapter passes mocked tests; real test call works with Faisal's key (he enters it locally).
- [x] **T4.2 Consent flow** (doc 06 section 6). *Accept:* declining or timing out excludes that participant's track; revoke works mid-meeting.
- [x] **T4.3 Transcription pipeline:** per-track segmenter, silence skip, queue with retry, transcript view. *Accept:* 10-minute 3-person test produces an attributed transcript.
- [x] **T4.4 Notes and summary:** rolling notes, final summary, Markdown export, share with participants. *Accept:* summary has all sections; export downloads.
- [x] **T4.5 (optional) Local Whisper** — superseded by the decision-C Moonshine local ASR via transformers.js on WebGPU. *Accept:* works offline on a WebGPU laptop; lazy-loaded.

## Phase 5: own TURN relay (gated, needs Proxmox access)

- [x] **T5.1 Discovery** (doc 09 stage A). *Accept:* discovery saved in `.secrets/`, summary and proposed `host.env` approved by Faisal.
- [x] **T5.2 Host network and NAT** (stages B and C). *Accept:* fresh SSH works, rollback disarmed, `meshly-turn-nat.service` active.
- [x] **T5.3 Container and coturn** (stage D). *Accept:* coturn active with a valid certificate; renewal dry run OK.
- [x] **T5.4 Verification** (stage E). *Accept:* relay candidates over UDP 3478 and TLS 443; container cannot reach the host.
- [x] **T5.5 Wire into Meshly** (stage F). *Accept:* relay-only call works between two devices; normal calls still connect directly.

## Phase 6: hardening and showcase

- [ ] **T6.1 Security review** against doc 07 threat model; fix findings. *Accept:* checklist in `docs/security-review.md`.
- [ ] **T6.2 Accessibility pass** (doc 05 section 9) with axe and keyboard-only run. *Accept:* no serious axe violations.
- [ ] **T6.3 Performance pass:** bundle budget, Lighthouse, VP9 preference experiment. *Accept:* budgets met.
- [ ] **T6.4 Showcase README:** screenshots (desktop and mobile), short demo GIF, architecture section, Lighthouse scores, credit. *Accept:* Faisal approves.
- [ ] **T6.5 Release v1.0.0:** release checklist (doc 10 section 4). *Accept:* tagged and deployed with approval.

## Open questions

Faisal answers these; the agent must not guess them.

1. ~~**Domain:**~~ answered 2026-10-17: app at `meshly.softautonomi.com`, TURN at `turn.softautonomi.com` (`ACME_EMAIL` `imfanee@gmail.com`). `VITE_APP_URL` updated everywhere.
2. ~~**cPanel:**~~ answered 2026-10-17: FTPS on `ftp.softautonomi.com:21`, user `devin@meshly.softautonomi.com`, account root is already the docroot. Note: the TLS cert names the shared server (altar45.supremepanel45.com), so the deploy script must set `servername`/loose verify; and this account cannot reach the cPanel home dir, so `meshly-config.php` will be a manual upload (phase 5).
3. ~~**Licence:**~~ answered 2026-10-18: custom source-available licence (`LICENCE` at repo root). Anyone may use the hosted app; self-hosting on another domain needs written permission and must keep the "Architected by Faisal Hanif" footer; modifications require contacting Faisal first.
4. **Co-host / host transfer:** needed in v1, or later?
5. **Recording by guests:** stays host-only (current spec)?
6. **Default AI provider suggestions:** any preferred provider to list first?
7. **Telephony:** any future plan for SIP or PSTN dial-in (would add a gateway and change the architecture)?
