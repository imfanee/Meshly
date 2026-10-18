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

## 2026-10-18: T2.2 Host controls

- Changed: `mute-req` and `lower-hand` ctl messages (host-only, verified against the host roster entry); `hostActions.askMute/lowerHand`; People panel rows gain "Ask to mute" and (when raised) "Hand down"; a consent banner "The host asks you to mute" with Mute/Dismiss appears over the control bar on the target's side. Remove/kick, lock, end-for-everyone and host-reload resume were already in place from T1.5.
- Verified: `npm run check` clean; hostControls e2e 3/3 (remove sends the guest to the removed screen, end-for-all sends guests to the ended screen, host reload resumes as host and admits still work).
- Commit: pending

## 2026-10-18: T2.1 Screen sharing

- Changed: `PeerManager.startShare/stopShare` (getDisplayMedia, sendonly video transceiver per peer, `contentHint: 'detail'`, 1500/1000 kbps bitrate, `tracks` ctl message carrying the mid, stop via `track.onended`); `sendCtlTo` for point-to-point ctl; `screen` flag in the media message; `screenStreamOf(peerId)` resolves the receiver-side track by mid; session adds the `share-req`/`share-ok`/`share-busy` host gate (host shares directly, guests ask first, busy reply names the sharer); Call stage adds the screen-large `object-contain` layout with camera filmstrip, "X is sharing" label, "You are sharing your screen" pill plus small self preview; Share button only on `getDisplayMedia` + fine pointer.
- Verified: `npm run check` clean; share e2e passes (host shares, guest sees "Host S is sharing" tile, stop cleans up).
- Open: tab/system audio mixing is not wired; share-req pending has no timeout.
- Commit: bf0015f

## 2026-10-18: T1.11 first production deploy

- Deployed: `npm run deploy` uploaded 32 files (3.4 MB) to `meshly.softautonomi.com` in 32 s, manifest written.
- Smoke checks (doc 08 s.5): `/` 200 with HSTS + full doc-07 CSP + X-Frame-Options + Referrer-Policy + Permissions-Policy; `sw.js` `cache-control: no-cache`; `manifest.webmanifest` `application/manifest+json`; SPA fallback serves index.html at `/r/abc`; `turn.php` 503 (TURN not configured yet, by design); `meshly-config.php` returns the SPA fallback 200 since the file does not exist (the deny rule applies only when the real file is present).
- Verified live 2026-10-18: Faisal confirmed Start Meeting and joining work on meshly.softautonomi.com over the real Nostr/MQTT transports (after the dev-relay leak fix, `f127982`).
- Commit: c5fc9ee + f127982 (dev-relay fix)

## 2026-10-18: T1.11 deploy script (first deploy pending gate)

- Changed: `app/scripts/deploy.mjs` implements doc 08 s.4: refuses stale builds (web older than app/src), builds a local manifest (size + SHA-256), fetches the remote `.deploy-manifest.json`, uploads in order (assets/fonts/icons/sounds, then misc, then index.html + manifest.webmanifest, sw.js last), skips unchanged files, keeps the last two releases of hashed assets, prints a summary, and supports `--dry-run`, `--config-only` (meshly-config.php to homeDir, chmod 600) and `--verbose`. FTPS handled via basic-ftp with the shared-hosting cert validated against the pinned `servername` in `.secrets/sftp.json` (`secureOptions.host` pinned, because basic-ftp would otherwise validate against the connect host).
- Verified: `npm run deploy:dry` connects to `ftp.softautonomi.com` and prints the plan (~30 files, ~2.5 MB, correct order, no deletions).
- Open: first production deploy awaits Faisal's approval (user gate); `.deploy-manifest.json` is hidden by `.htaccess` FilesMatch (FTP-only, by design); `meshly-config.php` remains a manual upload (FTP account jailed to docroot).
- Commit: pending

## 2026-10-18: T1.10 Content pages

- Changed: About gained the architecture explainer (link-secret crypto, encrypted signalling over Nostr/MQTT, STUN-first with own TURN on demand, full mesh, one tiny server script) plus "What we do not have"; Privacy kept the doc-07 draft and gained the honest-limitations section (link holders can knock, relays see traffic exists) and an email contact; Terms gained the licence clause matching the new LICENCE file (free to use hosted, permission + intact footer for self-hosting, contact for modifications) plus email and phone contact.
- Verified: `npm run check` clean; smoke e2e 7/7 covers all three routes and footer credit.
- Open: copy awaits Faisal's review gate before launch.
- Commit: pending

## 2026-10-18: T1.9 Staged ICE

- Changed: `core/webrtc/turn.ts` (TurnCredentials: validates the turn.php shape, caches until 5 min before expiry, 60 s backoff on 4xx/5xx/network errors); `peer.ts` escalation state machine per doc 04 s.4 (Stage 1 STUN-only, escalate on `iceConnectionState === 'failed'`, on descriptions set + 8 s not connected (`VITE_ICE_ESCALATE_MS`), or on a remote `ice` batch with `relay: true` and a newer restart generation; Stage 2 fetches creds, `setConfiguration` adds TURN, `restartIce()`; disconnected for 4 s restarts, still unconnected 8 s later escalates; 10 s after a failed local escalation we send `ice {relay: true}` so the remote escalates too; while TURN is down the peer warns via `turnUnavailable` and retries every 30 s); `PeerManager` polls `getStats` into rtt/loss/quality/link per peer and exposes restarts/escalations/turnDown on PeerInfo; relay-only mode (`settings.relayOnly`) makes `initPeerManager` fetch TURN creds first and refuse the join when the endpoint is down rather than leaking the IP; tiles show an amber "Relay unavailable, retrying" alert while a needed escalation cannot get credentials; the mobile More sheet gained "Hide my IP address" plus a "Connection details" readout (state, link, RTT, loss, restarts, escalations).
- Verified: `npm run check` clean; 38 unit tests (6 new: shape validation, caching, 503 backoff, network-error backoff, near-expiry refetch); e2e media + chat specs still green (3-way call, device switch, dedupe).
- Open: the 503 tile message is covered by unit tests (backoff + turnUnavailable flag), a real relayed call cannot be tested until coturn is live (Phase 5); relay-only needs the turn.php endpoint deployed before the toggle works.
- Commit: pending

## 2026-10-18: T1.8 Chat and reactions

- Changed: `ctl` data-channel protocol per doc 03 s.8 (`{t, id, ts, b}` JSON): the T1.7 ad-hoc media message moved to `{t:'media', b:{audio, video, screen, hand}}`; `sendChat`, `sendReact` (fixed 8-emoji set), `setHand` in the session store; `PeerManager.sendCtlAll`/`handleCtl` (public for tests) route ctl traffic; session dedupes by message `id` (`seenCtl`, capped 2000); Call chat panel renders messages with sender names and timestamps plus an Enter-to-send composer; unread badge on the Chat button clears when the chat tab is open; reaction picker popover plus floating reaction list (4 s); raised hand propagates via the media message and shows a badge on tiles.
- Verified: `npm run check` clean; 32 unit tests; e2e chat spec proves delivery plus dedupe (injecting the same id twice yields one message); admission/media/capacity suites unaffected.
- Open: private chat (`to:`) and message persistence are not in v1; reactions are transient only.
- Commit: faa8bb7

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
- Commit: faa8bb7

## 2026-10-17: T1.4 Signalling hub

- Changed: `core/signalling/` per doc 03 s.3 and 7: `transport.ts` contract; `nostr.ts` (kind-25050, `t` tag, throwaway Nostr key, paced sends at ~9/s); `mqtt.ts` (WSS, QoS 0, `meshly/v1/` prefix, paced sends, multi-broker fan-out); `devRelay.ts` (WS to `tools/dev-relay.mjs`); `envelope.ts` (`signEnvelope`, `encode`, `ReceivePipeline` with all drop reasons from doc 10); `hub.ts` (publish to every transport, inbound dedupe by ciphertext hash). `tools/dev-relay.mjs` 40-line WS rebroadcaster; `scripts/dev.mjs` runs Vite + relay together; `?e2e=1` harness exposes core modules via a dynamic (code-split) import for tests only.
- Verified: 26 unit tests pass incl. every doc-10 pipeline drop reason (oversize, bad decrypt, bad json/shape, wrong-to, self, stale ts, replayed id, bad pk, bad sig, wrong signer for host-only) and hub fan-out/dedupe. e2e 8/8, including two browser tabs exchanging a signed, AES-GCM-encrypted `hello` over the dev relay. `npm run check` clean; build 42.8 KB gzipped main bundle.
- Open: transport selection and call-site wiring land in T1.5 (session store); public Nostr/MQTT transports verified only via the T0.3/T0.4 spike scripts so far, not yet exercised through the hub.
- Commit: faa8bb7

## 2026-10-17: T1.3 Crypto and room model

- Changed: `core/crypto/` modules per doc 03: `encoding.ts` (base64url, base58, hex, canonical JSON), `hkdf.ts` (WebCrypto HKDF-SHA256, `deriveRoomKeys` topic + AES-256-GCM key), `aead.ts` (seal/open with topic-bound AAD), `sign.ts` (ECDSA P-256 identity, peerId/thumbprints, canonical-JSON sign/verify), `ticket.ts` (issue/verify admission tickets with verdicts). `core/room/room.ts` (createRoom with real ECDSA host identity, joinRoomKeys) and `hostKeyStore.ts` (IndexedDB persistence, 24 h TTL). Home and PostCall now create real host keys and store them.
- Verified: 21 unit tests pass covering doc 10 items: base64url round trip, RFC 5869 HKDF test case 1, AES-GCM round trip plus tamper and wrong-AAD rejection, ECDSA sign/verify and wrong-key rejection, thumbprint stability, canonical JSON ordering/nesting/unicode, ticket verdicts (valid, expired, wrong room, wrong peer, kicked, bad sig, malformed). `npm run check` clean; build OK.
- Open: host-key reload path is stored but not yet used on refresh; lands with admission in T1.5.
- Commit: faa8bb7

## 2026-10-17: T1.2 PWA

- Changed: generated the full icon set with `@vite-pwa/assets-generator` (pwa-64/192/512, maskable-512, apple-touch-180, favicon.ico) from `logo.svg`; `scripts/make-og.mjs` draws `og.png` (1200x630) and both manifest screenshots via sharp-composed SVG; manifest completed per doc 05 s.6 (id, start_url, display_override window-controls-overlay, shortcuts, categories, screenshots); `platform/install.svelte.ts` implements the full install decision tree (standalone / beforeinstallprompt / iOS Safari / iOS other / macOS Safari / hidden); `InstallSheet` guide UI; install button in the Home top bar; window-controls-overlay 32px drag title bar in `App.svelte`; SW update checks on launch plus every 60 minutes.
- Verified: manifest JSON valid with 3 icons + 2 screenshots + display_override; e2e 7/7 including offline reload showing the app shell after SW activation; `npm run check` clean; build 26 precache entries.
- Open: real Chrome "Install" producing a borderless desktop window needs a human DevTools check on a desktop browser (manual matrix row 1); screenshots are branded placeholders until real UI captures exist.
- Commit: faa8bb7

## 2026-10-17: T1.1 Design system and shell

- Changed: full `en-GB` string table; `core/room/link.ts` (room link codec with strict regexes); history router (`lib/router.svelte.ts`); rune stores `session`, `ui`, `settings`; theme module (system/light/dark, `[data-theme]` on any element so the call view can pin dark); UI kit: Button, IconButton, Input, Dialog (native `<dialog>`), Sheet, Toaster, Tooltip, Tabs, Footer, MeshLogo; screens: Home (hero, start card, join link, features, how-it-works), Room container (unsupported/incomplete-link states), PreJoin, Lobby, Call chrome (auto-hiding top bar, stage, desktop and mobile control bar with More sheet, side panel), PostCall, About, Privacy and Terms (doc-07 drafts), NotFound; PWA update toast wired via `virtual:pwa-register`.
- Verified: `npm run check` clean; unit tests 8/8 (link codec); e2e 6/6 (all routes, footer credit, mobile 360px pre-join, incomplete link, focus); build 39.6 KB gzipped; no em-dashes in `src/`.
- Decisions: Lobby/Call/PostCall are phases inside the `/r/:roomId` route, matching the doc-02 module map; `@lucide/svelte` icons; `.svelte.ts` store files needed an explicit tseslint parser override (eslint-plugin-svelte claims that extension).
- Open: host identity is still a placeholder random thumbprint until T1.3 wires real ECDSA keys; room state, real media and panels land in T1.5 to T1.8.
- Commit: faa8bb7

## 2026-10-17: T0.5 Spike: AI model IDs and CORS

- Changed: added `docs/spikes/ai-models.md` with verified default model IDs per provider and live CORS probe results.
- Verified: OpenAI transcription default must be `gpt-transcribe` (whisper-1 and the gpt-4o-transcribe family are deprecated, removal 2027-02-26); summary default `gpt-5-mini`. Anthropic `claude-haiku-5-5` is real and current. Gemini defaults `gemini-3.1-flash-lite` (summary) and `gemini-3.5-transcribe` (transcription); Groq `whisper-large-v3-turbo` plus `openai/gpt-oss-20b` (llama-3.3-70b deprecated 2026-08). CORS probes: all five endpoints return usable preflights and origin headers from a browser; Gemini requires sending only `content-type` and `x-goog-api-key`.
- Open: Groq turned out to be an attractive default suggestion (free tier, cheap fast Whisper); flagged for Faisal under open question 6.
- Commit: faa8bb7

## 2026-10-17: T0.4 Spike: MQTT brokers

- Changed: added `app/tools/spike-mqtt.mjs` (two clients per broker, 20 QoS-0 messages, delivery and latency); results in `docs/spikes/mqtt.md`; `VITE_MQTT_BROKERS` updated in `.env.example`, `app/.env` and `app/.env.production`.
- Verified: 5 candidates probed. Kept broker.hivemq.com:8884 (20/20, 36 ms median), test.mosquitto.org:8081 (20/20, 45 ms) and broker.emqx.io:8084 (drops bursts above about 10 msgs/s, consistent across runs, kept as third fallback since the hub caps sends at 10/s). Dropped mqtt.eclipseprojects.io and broker.mqtt.cool (connack timeouts).
- Open: hub should pace MQTT sends so fast join bursts do not trip emqx's cap; noted in the spike doc.
- Commit: faa8bb7

## 2026-10-17: T0.3 Spike: Nostr relays

- Changed: added `app/tools/spike-nostr.mjs` (two connections per relay, 20 kind-25050 events, measures OK acks, delivery and latency); results and decision in `docs/spikes/nostr.md`; `VITE_NOSTR_RELAYS` updated in `.env.example`, `app/.env` and `app/.env.production`.
- Verified: 8 candidates probed. Kept relay.primal.net, nos.lol, nostr.mom (20/20, median 137 to 152 ms) and nostr.oxtr.dev (rate-limited only above its threshold; our test burst exceeds the app's 10/s cap). Dropped damus (rejects kind 25050), nostr.band and nostr.bg (connectivity), offchain.pub (loss, 333 ms median).
- Open: none.
- Commit: faa8bb7

## 2026-10-17: T0.2 Scaffold app

- Changed: created `app/` with Vite 8 + Svelte 5.57 + TypeScript 6 strict; `build.outDir: '../web'`, `emptyOutDir: true`; Tailwind v4 via `@tailwindcss/vite` with doc-05 design tokens bound through `@theme inline`; ESLint 10 flat config (tseslint + eslint-plugin-svelte + prettier), Prettier + svelte-check; Vitest 5 (own `vitest.config.ts`, node env); Playwright 1.64 (Chromium with fake-media flags, builds then previews); `vite-plugin-pwa` 2 (`registerType: 'prompt'`, manifest per doc 05 section 6); `scripts/copy-infra.mjs` prebuild copying `infra/cpanel/.htaccess`, `assets.htaccess`, `api/turn.php` and the Inter woff2 from `@fontsource-variable/inter` into `public/`; `src/config.ts` reading all `VITE_*` env with fallbacks; `app/.env` (dev, git-ignored) and `app/.env.production` (tracked, public values only); npm scripts `dev`, `build`, `preview`, `check`, `test`, `test:e2e`, `deploy`, `deploy:dry`; mesh-mark `logo.svg`; minimal `App.svelte` placeholder pending T1.1.
- Verified: `npm run check` clean (svelte-check, tsc, eslint, prettier); `npm run test` 2/2; `npm run build` produces `web/index.html`, `web/.htaccess`, `web/assets/.htaccess`, `web/api/turn.php`, `web/fonts/InterVariable.woff2`, manifest and sw.js; `npm run test:e2e` 1/1 (Chromium + OS deps installed via playwright install-deps); initial JS 12.7 KB gzipped.
- Decisions: used `@lucide/svelte` (the `lucide-svelte` package is deprecated upstream and redirects there); `deploy.mjs` is a safe stub until T1.11; `web/` and generated `public/` copies are git-ignored so `infra/` stays the source of truth.
- Open: real PWA icons, og.png and sounds arrive in T1.2 (manifest already references them); open questions 1 to 7.
- Commit: faa8bb7

## 2026-10-17: T0.1 Environment check

- Changed: installed Node.js v24.22.0 (active LTS "Krypton", satisfies "LTS 22+") to /usr/local from the official tarball with SHA-256 verification; npm 11.19.1 included. Confirmed `agent/commands/*.md` already mirrored into `.claude/commands/` (identical), so `/next-task`, `/status`, `/deploy-web`, `/setup-turn` are available.
- Verified: node v24.22.0, npm 11.19.1, git 2.47.3, OpenSSH 10.0p2, scp (OpenSSH), tar/xz/curl present. OS: Debian 13 (trixie) x86_64, kernel 6.12.
- Note: this environment is Linux at `/root/Meshly`, not the Windows path `D:\Reposetories\Meshly` assumed in AGENTS.md. PowerShell-specific steps (for example `icacls`) do not apply here; key permissions use `chmod 600` instead. Removed the stray `t0.1-env-check.ps1` scratch script (Windows-only, superseded by this check).
- Open: ~960 MB RAM on this VM; large npm installs and Vite builds may be tight. Open questions 1 to 7 in docs/11-ROADMAP-TASKS.md.
- Commit: faa8bb7

## 2026-10-17: Project specification

- Changed: README, AGENTS.md, CLAUDE.md, docs 01 to 11, ADRs 0001 to 0008, cPanel and TURN infrastructure files created by the architect's assistant.
- Verified: shell scripts pass `bash -n`; `turn.php` passes `php -l`; docs reviewed for consistency.
- Open: open questions 1 to 7 in docs/11-ROADMAP-TASKS.md.
- Next: T0.1 Environment check.

## 2026-10-18: T2.3 Video slots

- Changed: `videoSenderCount()` + guest-side gate in `mediaActions.setCam` (when slots are full, guests send `slot-req` to the host; first-come `slot-ok`/`slot-deny` replies drive the camera on or a "No free camera slots" toast); host `revokeSlot` sends `slot-revoke` (camera off without consent, per doc 06 s.4 reassignment) and the People panel shows "Camera off" for video peers; slot state resets on leave.
- Verified: `npm run check` clean; slots e2e passes (host revokes guest camera, camOn flips false remotely).
- Open: full-room deny path needs 7+ contexts, exercised via the same ctl round-trip as the verified revoke path.
- Commit: pending

## 2026-10-18: T2.4 Bitrate policy and off-screen pause

- Changed: `applyBitratePolicy` now counts video senders in the room (self when sending + peers with camOn) and applies the doc 04 s.3 table (1500/800/450 kbps, scale 1/1.5/2, 30/24/20 fps); a peer relayed via TURN gets its own encoding capped at 500 kbps, scale >= 2, 20 fps; screen senders get 1500 kbps (1000 relayed) at 15 fps; `watch` ctl message lets a peer pause my camera encoding to it (`active: false`) when my tile is off its screen for 10 s (IntersectionObserver on tiles, immediate resume on visible).
- Verified: `npm run check` clean; bitrate e2e passes (guest sender params show 1,500 kbps / scale 1 / 30 fps at two senders).
- Open: 4- and 6-sender tiers need more e2e contexts than the cap allows; policy math is table-driven so tiers are covered by the same code path.
- Commit: pending

## 2026-10-18: T2.5 Reconnect robustness

- Changed: `Peer.requestRestart()` public restart; `online` event restarts any peer not in `connected`; peer timeout cleanup closes a pc stuck disconnected/failed for 30 s (re-establishes via hello/sdp while roster keeps the seat); devRelay reconnects with a 2 s backoff while open (Nostr pool and MQTT already reconnect natively: SimplePool per-relay, mqtt `reconnectPeriod: 5s`).
- Verified: `npm run check` clean; reconnect e2e passes (forced `restartIce` returns the pair to `connected`).
- Open: manual Wi-Fi to 4G switch remains a live check on real devices.
- Commit: pending

## 2026-10-18: T2.6 File transfer

- Changed: `core/files/fileTransfer.ts` (file-offer/accept/decline/cancel ctl, `file:<id>` ordered channel, 16 KB chunks with 1 MB backpressure, final SHA-256 verify); `Peer.createChannel` + `onDataChannel`; session `sendFile/acceptFile/declineFile/cancelFile/saveFile` with a lazily loaded manager and a frame queue so early chunks are not dropped; received blobs live outside reactive state (a Svelte proxy breaks Blob methods); chat panel gains a paperclip picker and transfer cards (Accept/Decline, progress, Cancel, Save, failed).
- Verified: `npm run check` clean; 50 MB file e2e passes with matching SHA-256.
- Open: OPFS path for >25 MB receivers deferred (memory assembly works but is heavier on constrained devices).
- Commit: pending

## 2026-10-18: T2.7 Settings dialog

- Changed: `lib/ui/SettingsDialog.svelte` (Dialog-based, three sections): Appearance (display name + theme, persisted to localStorage), Devices (mic/camera pickers via localMedia switch, devicechange listener), Advanced (relay-only, Nostr/MQTT transport toggles, connection-details toggle). Gear button on the Home header opens it.
- Verified: `npm run check` clean; settings e2e passes (name + theme persist across a reload and re-appear in the dialog).
- Commit: pending

## 2026-10-18: T3.1 Compositor and mixer

- Changed: `core/recording/compositor.ts` (1280x720 canvas at 25 fps, doc-05 grid layout up to 6 tiles, avatar + initials for audio-only, name labels, speaking ring, screen-share layout with share at ~75% width, hidden <video> elements as frame sources) driven by `ticker.worker.ts` (worker timers keep firing while the tab hides); Web Audio mixer connects every participant's audio track to a `MediaStreamAudioDestinationNode`; `getStream()` = captureStream(25) video + mixed audio; session `startComposite/stopComposite` (lazy-loaded, sources re-read each tick from peers + local + screen). Renamed the Settings dialog field to "Display name" after it collided with Home's "Your name" in e2e locators.
- Verified: `npm run check` clean; recording e2e passes (tick rate ~25 fps, output stream has video+audio).
- Open: the 5-minute hidden-tab run is a live check (headless cannot force `document.hidden`); composite preview UI arrives with the recorder in T3.2.
- Commit: pending

## 2026-10-18: T3.2 Recorder and sinks

- Changed: `core/recording/recorder.ts` (MediaRecorder 5 s timeslice, mime pick vp9>vp8): File System Access `showSaveFilePicker` streams chunks straight to disk on Chromium (flat memory); OPFS `meshly-recording.part` buffer elsewhere, `fix-webm-duration` applied at stop, then download; OPFS `.part` orphans are offered as a recovered download on next app load. Session `startRecording/stopRecording` (host-only; composite starts, flags `session.recording`, announce). UI: host gets "Record this meeting" in the More sheet and a red REC pill in the call header; `App` runs `checkRecordingRecovery` on mount.
- Verified: `npm run check` clean; recording e2e 2/2 (fps + OPFS download of a .webm).
- Open: 60-min flat-memory and Safari/Firefox playback are live checks; FS-streamed files keep MediaRecorder's live-muxed duration (readers treat it as a stream) — same fix could be applied server-side if ever needed.
- Commit: pending

## 2026-10-18: T3.3 Recording notice

- Changed: `recording` flag rides the media ctl broadcast (`PeerManager.setRecording`, `peerMedia` map, `PeerInfo.recording`); `recordingActive()` = self flag or any peer's flag; every participant sees the red "Recording" status in the call header and a two-tone chime (`playRecordChime`, 880/660 Hz) plays once per state change; the host sees a consent dialog ("Everyone will see a notice; the file stays on your device") before recording starts.
- Verified: `npm run check` clean; notice e2e passes (guest sees the banner within 1 s of the host recording).
- Commit: pending

## 2026-10-18: T4.1 AI provider settings and adapter

- Decision (Faisal): option C hybrid — in-browser Moonshine transcription + Transformers.js summary by default; BYOK presets (Groq, Gemini, generic OpenAI-compatible) as the quality upgrade. GitHub Models removed as an option (service shut down July 2026).
- Changed: `core/ai/providers.ts` preset table (local/groq/gemini/openai-compat with base URLs and default models); `core/ai/openaiCompat.ts` chat adapter + `testKey` credential probe (covers all three BYOK presets, Gemini via its /v1beta/openai surface); settings gains aiProvider/aiKey/aiBaseUrl/aiModel/aiTranscribeModel/rememberAiKey with persistence to localStorage only when remember is ticked (doc 07); Settings dialog gains the AI notes section with provider picker, key/endpoint/model fields, a Test connection button, and the privacy note.
- Verified: `npm run check` clean.
- Open: real-key test call awaits Faisal entering his Groq/Gemini key locally; Anthropic adapter deferred (no transcription endpoint, Gemini covers the same BYOK need).
- Commit: pending

## 2026-10-18: T4.2 AI notes consent flow

- Changed: `notes-req`/`notes-consent`/`notes-off` ctl messages; receivers get a dialog ("X wants to use AI notes. Allow their AI provider to transcribe your voice?") with Allow/Decline and a 30 s auto-decline; `revokeNotesConsent` sends consent false mid-meeting; `notesAllowed` set on the note-taker drives `notesConsented(peerId)`/`consentedPeerIds()` for the T4.3 transcription gate; the Notes panel shows the pill ("X is running AI notes"), Start for the would-be taker (gate: BYOK needs a key first), Stop for the taker, Revoke for consenters; consent state resets on leave.
- Verified: `npm run check` clean; notes e2e passes (decline leaves the set empty, allow adds, revoke removes mid-meeting).
- Commit: pending

## 2026-10-18: T4.3 Transcription pipeline

- Changed: `core/ai/pipeline.ts` (per-track MediaRecorder producing ~20 s standalone segments on audio-only streams, AnalyserNode RMS gate discarding >95% silent segments, upload queue at concurrency 2 with 3 retries and exponential backoff, attributed TranscriptLine{speaker,ts,text} sorted by time); `core/ai/transcribe.ts` (local Moonshine via lazy-loaded @huggingface/transformers at 16 kHz, BYOK OpenAI-compatible /audio/transcriptions multipart); `core/ai/prompts.ts` (transcript-only, names, British English, no em-dashes); session wiring (pipeline starts with AI notes, consented peers join via addConsentedTrack, revokes remove taps, 5-min rolling updateNotes, finalNotes with the sectioned prompt, downloadNotes Markdown export, transcript/notesText/notesBusy state); Notes panel shows transcript, notes and Update/Download/End buttons.
- Bugs found by e2e: MediaRecorder on a mixed audio+video stream with an audio mime fails silently (audio-only stream fix); a suspended AudioContext made the silence gate drop everything (kept-when-not-running fix); consent arriving before the async pipeline init dropped the peer tap (ensure-then-add fix).
- Verified: `npm run check` clean; pipeline e2e passes (2 taps, attributed lines from You + Guest P with a stub transcriber; the real Moonshine and BYOK paths share the same pipeline).
- Open: the 10-min 3-person attributed transcript with real models is a live check; @huggingface/transformers installed with --ignore-scripts to skip onnxruntime-node's GPU binary download (browser uses onnxruntime-web).
- Commit: pending

## 2026-10-18: T4.4 Notes, summary, share

- Changed: `notesMarkdown()` builds the export (title, date, participants, summary, transcript); `shareNotes()` sends it over ctl `notes-share`; recipients keep `session.sharedNotes{fromName,md}` with a Preview + Download card in the Notes panel; note-taker gets "Share with everyone". Rolling notes and the sectioned final summary shipped in T4.3.
- Verified: `npm run check` clean; notes e2e 2/2 (consent set + shared Markdown reaching the recipient, `# Meshly notes` with participant names).
- Open: summary section quality with real models is a live check.
- Commit: pending

## 2026-10-18: T5.1-T5.4 TURN infrastructure (Option A, bridged)

- Decision (Faisal): Option A, container directly on vmbr0 with its own public IP; the doc's NAT/private-bridge design was superseded (the IP is an OVH failover-IP pattern, same as the other guests).
- Changed: CT 101 `meshly-turn` on prox1 (PVE 9.2.21), unprivileged Debian 13, 512 MB, bridged on vmbr0 as 51.38.218.46/32 (MAC 02:00:00:e1:7e:d3, gw 51.38.43.254), onboot. coturn 4.6.1 + certbot 4.0.0 + unattended-upgrades + vnstat; certbot HTTP-01 issued a LE cert for turn.meshly.softautonomi.com; cert copied to /etc/coturn/certs by the deploy hook. turnserver.conf adds `alt-tls-listening-port=443` (did not bind in 4.6.1) so a socat `meshly-tls443.service` forwards 443 to 51.38.218.46:5349; `denied-peer-ip=51.38.43.33` plus a persistent nftables `meshly-isolate.service` drops CT output to the host. turn.env shredded inside the container.
- Verified: STUN binding over UDP 3478 externally; TCP 3478 reachable; TLS handshake on 5349 and 443 with the LE cert; full TURN allocation via turnutils_uclient over UDP with REST credentials (0% loss); CT-to-host BLOCKED while internet OK; renewal dry run OK.
- Open: T5.5 wires turn.php and the app ICE config; the TURN_SECRET lives in .secrets/turn.env and must also go into .secrets/meshly-config.php on cPanel.
- Commit: pending

## 2026-10-18: T5.5 TURN wired into Meshly (live)

- Changed: `infra/cpanel/api/turn.php` gained a jailed-FTP fallback so meshly-config.php can live inside the docroot (.htaccess FilesMatch already denies it to HTTP); `scripts/upload-turn-config.mjs` uploads config + turn.php over the same pinned FTPS as deploy; `.env.production` sets `VITE_OWN_STUN_URL=stun:turn.meshly.softautonomi.com:3478` (our own STUN first). Deployed meshly-config.php + turn.php + rebuilt web/.
- Verified: `/meshly-config.php` returns 403 over HTTP; `/api/turn.php` returns real credentials `turn:turn.meshly.softautonomi.com:3478` udp/tcp + `turns:...:443` tcp with a valid HMAC; site 200 after deploy.
- Open: the acceptance "relay-only call works between two devices" needs a live check on real devices (headless e2e cannot reach public relays from here) — enable "Hide my IP address" in two browsers, run a call, confirm "relayed" on the tile dots.
- Commit: pending

## 2026-10-18: Live-test bug fixes (cam toggle, notes, dialog)

- Bug 1 (cam off killed remote audio): Tile's <video> carried remote audio and unmounted on camOff. Fix: remote stream stays mounted on a non-muted element, hidden via class so audio survives.
- Bug 2 (cam on gave no local view): mediaActions.setCam flipped settings.camOn before the track existed, latching the camOn expression false. Fix: flag flips after await localMedia.setCam.
- Bug 3 (notes errors): MediaRecorder.start() inside ondataavailable while still recording caused InvalidStateError. Fix: proper stop()/onstop start() segmenter cycle; CSP gained blob: in script-src for the ONNX/transformers.js webgpu bundle.
- Bug 4: no way to close dialogs. Fix: X close button on Dialog.svelte (all dialogs).
- Verified: cam-off propagates camOn false and the remote audio element stays attached (e2e); check clean. Headless fake-device re-acquire does not produce frames so the local-preview frames assertion stays a live check.
- Commit: pending
