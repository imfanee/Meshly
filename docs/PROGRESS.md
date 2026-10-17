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

## 2026-10-18: T1.8 Chat and reactions

- Changed: `ctl` data-channel protocol per doc 03 s.8 (`{t, id, ts, b}` JSON): the T1.7 ad-hoc media message moved to `{t:'media', b:{audio, video, screen, hand}}`; `sendChat`, `sendReact` (fixed 8-emoji set), `setHand` in the session store; `PeerManager.sendCtlAll`/`handleCtl` (public for tests) route ctl traffic; session dedupes by message `id` (`seenCtl`, capped 2000); Call chat panel renders messages with sender names and timestamps plus an Enter-to-send composer; unread badge on the Chat button clears when the chat tab is open; reaction picker popover plus floating reaction list (4 s); raised hand propagates via the media message and shows a badge on tiles.
- Verified: `npm run check` clean; 32 unit tests; e2e chat spec proves delivery plus dedupe (injecting the same id twice yields one message); admission/media/capacity suites unaffected.
- Open: private chat (`to:`) and message persistence are not in v1; reactions are transient only.
- Commit: pending

## 2026-10-17: T1.7 Call UI

- Changed: `lib/ui/Tile.svelte` (video or avatar with initials on a peerId-derived colour, name label, mic-off icon, connection dot green/amber/red, speaking ring, host remove menu); `core/media/activeSpeaker.ts` (shared AudioContext, per-peer analyser, 100 ms RMS, 300 ms speak threshold, 1.5 s dwell; also feeds the PreJoin mic meter and the "You are muted" hint); `PeerManager` now polls `getStats` every 2 s for link kind (direct/relayed) and quality (doc 04 s.6 thresholds) and relays mic/cam state over the `ctl` channel (`k:'media'`); Call stage has grid (1/2/3-column rules) and speaker (large + filmstrip) layouts with a toggle in the desktop control bar and the mobile More sheet; People and Chat buttons carry badges; camera flip wired in More; "Tap to turn on sound" overlay appears when autoplay blocks a remote video.
- Verified: `npm run check` clean; 32 unit tests; e2e 14/14 (3-way call, device switch, capacity, admission).
- Debug notes: capacity test initially failed because a stale `web/` build (maxParticipants=12) was being served by a reused preview; the real signal was the host keeping Guest C in pending rather than denying. Fixed by rebuilding with the e2e env and disabling trace on the four-context capacity spec (trace zip corrupted under load).
- Open: pin on tiles is placeholder-only; raised-hand badge awaits T1.8 ctl messages; screen layout auto-switches on share in T2.1.
- Commit: cca0dc0

## 2026-10-17: T1.6 Peer manager and media

- Changed: `core/media/localMedia.ts` (doc 04 mic/camera constraints, mic mute via track.enabled, camera off via replaceTrack(null) + stop, device switching, facingMode flip, onChange notifications); `core/webrtc/peer.ts` (W3C perfect negotiation, `ctl` data channel, fixed transceiver order audio then video, ICE batching 300 ms or 10 candidates, early-candidate buffering); `core/webrtc/peerManager.ts` (peer map, roster reconcile, bitrate policy per doc 04 s.3, wake lock); session store now routes sdp/ice to the PeerManager only for ticket-verified peers (buffered while hello verification is pending); Call.svelte renders real tiles (local preview plus remote video) with aria-live join/leave announcements; PreJoin shows a live camera preview.
- Verified: `npm run check` clean; 32 unit tests pass; e2e 14/14 including the new three-way call (3 playing videos at all ends) and device-switch tests.
- Found and fixed during e2e: `RTCSessionDescription` is a platform object so `canonicalJson` signed an empty `description` (now serialised explicitly); ICE candidates arriving before the remote description were dropped (now buffered); remotely-created transceivers start `recvonly` so `replaceTrack` alone never sent media on the answerer (direction now set to `sendrecv` when a track is bound); test-only bugs: `VITE_MAX_PARTICIPANTS` raised to 3 for e2e, the People panel toggle double-opened in the capacity test.
- Deferred: `getStats` polling and the active-speaker analyser (doc 04 s.6-7) land with T1.7/T1.9; screen-share transceiver and the "tap to play sound" fallback are stubbed for T1.7.
- Commit: 6aa7d3f

## 2026-10-17: T1.5 Lobby and admission

- Changed: `core/room/state.ts` (RoomState + sign/verify per doc 03 s.6), `core/room/membership.ts` (knock loop every 5 s, host-here every 15 s, admit with ticket + roster + signed state, deny with reason, kick, end, bye, capacity via `maxParticipants`, lock that also denies pending knocks, lobby host-away detection). `core/signalling/index.ts` `makeTransports()` (dev relay wins, else Nostr + MQTT, all lazy-imported). Session store now connects the hub and drives membership; PreJoin "Start meeting"/"Ask to join" run the real flows; Room detects a persisted host key to restore host role on reload; Call people panel shows knocks with Admit/Deny, roster with Remove, and a Lock toggle; knock toast for the host. Playwright preview build now sets `VITE_DEV_RELAY_URL` + `VITE_MAX_PARTICIPANTS=2`.
- Verified: 32 unit tests (membership suite covers admit, deny, locked, full, kick, end over real hubs on an in-memory transport); e2e 12/12 including create/join, deny, lock and capacity with per-participant browser contexts (shared contexts leak IndexedDB host keys, a real bug found and handled). Initial bundle now 48.7 KB gzip; mqtt/nostr chunks lazy-load.
- Open: `media`/`sdp`/`ice` handlers ignored until T1.6; denied guest re-knock UX is minimal.
- Commit: pending

## 2026-10-17: T1.4 Signalling hub

- Changed: `core/signalling/` per doc 03 s.3 and 7: `transport.ts` contract; `nostr.ts` (kind-25050, `t` tag, throwaway Nostr key, paced sends at ~9/s); `mqtt.ts` (WSS, QoS 0, `meshly/v1/` prefix, paced sends, multi-broker fan-out); `devRelay.ts` (WS to `tools/dev-relay.mjs`); `envelope.ts` (`signEnvelope`, `encode`, `ReceivePipeline` with all drop reasons from doc 10); `hub.ts` (publish to every transport, inbound dedupe by ciphertext hash). `tools/dev-relay.mjs` 40-line WS rebroadcaster; `scripts/dev.mjs` runs Vite + relay together; `?e2e=1` harness exposes core modules via a dynamic (code-split) import for tests only.
- Verified: 26 unit tests pass incl. every doc-10 pipeline drop reason (oversize, bad decrypt, bad json/shape, wrong-to, self, stale ts, replayed id, bad pk, bad sig, wrong signer for host-only) and hub fan-out/dedupe. e2e 8/8, including two browser tabs exchanging a signed, AES-GCM-encrypted `hello` over the dev relay. `npm run check` clean; build 42.8 KB gzipped main bundle.
- Open: transport selection and call-site wiring land in T1.5 (session store); public Nostr/MQTT transports verified only via the T0.3/T0.4 spike scripts so far, not yet exercised through the hub.
- Commit: pending

## 2026-10-17: T1.3 Crypto and room model

- Changed: `core/crypto/` modules per doc 03: `encoding.ts` (base64url, base58, hex, canonical JSON), `hkdf.ts` (WebCrypto HKDF-SHA256, `deriveRoomKeys` topic + AES-256-GCM key), `aead.ts` (seal/open with topic-bound AAD), `sign.ts` (ECDSA P-256 identity, peerId/thumbprints, canonical-JSON sign/verify), `ticket.ts` (issue/verify admission tickets with verdicts). `core/room/room.ts` (createRoom with real ECDSA host identity, joinRoomKeys) and `hostKeyStore.ts` (IndexedDB persistence, 24 h TTL). Home and PostCall now create real host keys and store them.
- Verified: 21 unit tests pass covering doc 10 items: base64url round trip, RFC 5869 HKDF test case 1, AES-GCM round trip plus tamper and wrong-AAD rejection, ECDSA sign/verify and wrong-key rejection, thumbprint stability, canonical JSON ordering/nesting/unicode, ticket verdicts (valid, expired, wrong room, wrong peer, kicked, bad sig, malformed). `npm run check` clean; build OK.
- Open: host-key reload path is stored but not yet used on refresh; lands with admission in T1.5.
- Commit: pending

## 2026-10-17: T1.2 PWA

- Changed: generated the full icon set with `@vite-pwa/assets-generator` (pwa-64/192/512, maskable-512, apple-touch-180, favicon.ico) from `logo.svg`; `scripts/make-og.mjs` draws `og.png` (1200x630) and both manifest screenshots via sharp-composed SVG; manifest completed per doc 05 s.6 (id, start_url, display_override window-controls-overlay, shortcuts, categories, screenshots); `platform/install.svelte.ts` implements the full install decision tree (standalone / beforeinstallprompt / iOS Safari / iOS other / macOS Safari / hidden); `InstallSheet` guide UI; install button in the Home top bar; window-controls-overlay 32px drag title bar in `App.svelte`; SW update checks on launch plus every 60 minutes.
- Verified: manifest JSON valid with 3 icons + 2 screenshots + display_override; e2e 7/7 including offline reload showing the app shell after SW activation; `npm run check` clean; build 26 precache entries.
- Open: real Chrome "Install" producing a borderless desktop window needs a human DevTools check on a desktop browser (manual matrix row 1); screenshots are branded placeholders until real UI captures exist.
- Commit: pending

## 2026-10-17: T1.1 Design system and shell

- Changed: full `en-GB` string table; `core/room/link.ts` (room link codec with strict regexes); history router (`lib/router.svelte.ts`); rune stores `session`, `ui`, `settings`; theme module (system/light/dark, `[data-theme]` on any element so the call view can pin dark); UI kit: Button, IconButton, Input, Dialog (native `<dialog>`), Sheet, Toaster, Tooltip, Tabs, Footer, MeshLogo; screens: Home (hero, start card, join link, features, how-it-works), Room container (unsupported/incomplete-link states), PreJoin, Lobby, Call chrome (auto-hiding top bar, stage, desktop and mobile control bar with More sheet, side panel), PostCall, About, Privacy and Terms (doc-07 drafts), NotFound; PWA update toast wired via `virtual:pwa-register`.
- Verified: `npm run check` clean; unit tests 8/8 (link codec); e2e 6/6 (all routes, footer credit, mobile 360px pre-join, incomplete link, focus); build 39.6 KB gzipped; no em-dashes in `src/`.
- Decisions: Lobby/Call/PostCall are phases inside the `/r/:roomId` route, matching the doc-02 module map; `@lucide/svelte` icons; `.svelte.ts` store files needed an explicit tseslint parser override (eslint-plugin-svelte claims that extension).
- Open: host identity is still a placeholder random thumbprint until T1.3 wires real ECDSA keys; room state, real media and panels land in T1.5 to T1.8.
- Commit: pending

## 2026-10-17: T0.5 Spike: AI model IDs and CORS

- Changed: added `docs/spikes/ai-models.md` with verified default model IDs per provider and live CORS probe results.
- Verified: OpenAI transcription default must be `gpt-transcribe` (whisper-1 and the gpt-4o-transcribe family are deprecated, removal 2027-02-26); summary default `gpt-5-mini`. Anthropic `claude-haiku-5-5` is real and current. Gemini defaults `gemini-3.1-flash-lite` (summary) and `gemini-3.5-transcribe` (transcription); Groq `whisper-large-v3-turbo` plus `openai/gpt-oss-20b` (llama-3.3-70b deprecated 2026-08). CORS probes: all five endpoints return usable preflights and origin headers from a browser; Gemini requires sending only `content-type` and `x-goog-api-key`.
- Open: Groq turned out to be an attractive default suggestion (free tier, cheap fast Whisper); flagged for Faisal under open question 6.
- Commit: pending

## 2026-10-17: T0.4 Spike: MQTT brokers

- Changed: added `app/tools/spike-mqtt.mjs` (two clients per broker, 20 QoS-0 messages, delivery and latency); results in `docs/spikes/mqtt.md`; `VITE_MQTT_BROKERS` updated in `.env.example`, `app/.env` and `app/.env.production`.
- Verified: 5 candidates probed. Kept broker.hivemq.com:8884 (20/20, 36 ms median), test.mosquitto.org:8081 (20/20, 45 ms) and broker.emqx.io:8084 (drops bursts above about 10 msgs/s, consistent across runs, kept as third fallback since the hub caps sends at 10/s). Dropped mqtt.eclipseprojects.io and broker.mqtt.cool (connack timeouts).
- Open: hub should pace MQTT sends so fast join bursts do not trip emqx's cap; noted in the spike doc.
- Commit: pending

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
