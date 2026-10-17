# 10 Testing

Three layers: fast unit tests for the framework-free core, Playwright end-to-end tests with fake media and a local dev relay, and a manual real-device matrix before each release.

## 1. Unit tests (Vitest)

Location `app/tests/unit/`. Run `npm run test`. Target 90% line coverage for `core/crypto`, `core/signalling`, `core/admission`; 70% overall core.

| Area | Must cover |
| --- | --- |
| Encoding | base58 room IDs, base64url round trips, link parse/format, malformed links rejected |
| Crypto | HKDF vectors (RFC 5869 test case 1), AES-GCM round trip and tamper detection (flip one bit: decrypt fails), ECDSA sign/verify, thumbprint stability |
| Canonical JSON | key ordering, nested objects, unicode, identical output across runs |
| Envelope pipeline | each drop reason (oversize, bad decrypt, wrong `to`, replay by id, stale `ts`, bad sig, wrong signer for host-only types) |
| Tickets | valid, expired, wrong room, wrong peerId, wrong host key, kicked |
| Room state | `seq` ordering, signature checks, slot allocation (6 max), capacity (12 max), lock |
| Hub | fan-out to N transports, dedupe, per-sender rate limit |
| ICE strategy | state machine with fake timers: connect within timeout (no TURN fetch), timeout escalates, failed escalates, TURN 503 backs off, disconnected restart path, credential cache expiry |
| Bitrate policy | parameters per participant count and relay state |
| Layout | grid dimensions for 1 to 6 tiles in various viewports |
| AI | provider request shapes (mock `fetch`), consent state machine, silence skip, segment queue retry |
| PHP | `php -l infra/cpanel/api/turn.php`; a small PHP test (`php tests/turn_test.php`) for HMAC output against a known vector, if PHP is available locally (otherwise test on the server with curl) |

## 2. End-to-end tests (Playwright)

Location `app/tests/e2e/`. Run `npm run test:e2e`. Uses Chromium with:

```
--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream
--auto-select-desktop-capture-source=Entire screen
```

The Playwright config starts `vite preview` and `tools/dev-relay.mjs`, and builds with `VITE_DEV_RELAY_URL=ws://localhost:8787` so no public relays are touched. Each participant is a separate browser context.

| Scenario | Assertions |
| --- | --- |
| Create and join | Host starts; guest opens link, knocks; host admits; both see two tiles with video playing (`videoWidth > 0`) within 10 s |
| Deny | Guest sees "denied" state; no peer connection created |
| Lock | After lock, new knock is denied with "locked" |
| Capacity | 13th participant denied "full" (use audio-only fake contexts to keep CPU down) |
| Video slots | 7th camera request refused with slots-full message; freed slot can be taken |
| Chat | Message from A appears at B and C once (dedupe) |
| Screen share | Sharer's screen tile appears at viewers; stop removes it |
| Remove | Kicked participant sees removal message; others drop the tile |
| End | All participants reach Post-call "host ended" |
| Host reload | Host reloads page and is host again; can admit a new guest |
| Reconnect | Toggle context offline for 3 s, back online: call recovers via ICE restart |
| Recording | Host records 10 s (Chromium, OPFS path); downloaded file size > 100 KB and has a video track |
| PWA | Manifest valid, service worker registered, offline reload of `/` shows the app shell |
| Tamper | Inject a forged `admit` via the dev relay: guest ignores it |

TURN escalation cannot be exercised reliably in CI-style local runs; it is unit-tested with mocks and verified manually (section 3).

## 3. Manual device matrix (before each release)

| # | Device / browser | Network | Checks |
| --- | --- | --- | --- |
| 1 | Windows, Chrome (installed PWA) | Home fibre | Host, install, borderless window, record to disk, screen share with tab audio |
| 2 | Windows or macOS, Edge or Firefox | Home fibre | Guest, screen share without audio, chat, files |
| 3 | macOS, Safari | Wi-Fi | Guest, Add to Dock guide, recording download |
| 4 | Android, Chrome (installed) | 4G/5G | Guest, install, speaker layout, camera flip, wake lock |
| 5 | iPhone, Safari (Home Screen) | 4G/5G | Guest, install guide, tap-to-enable-audio, background and return |
| 6 | Any | Corporate or hotel Wi-Fi (or VPN forcing TCP) | Escalation to TURN, "Relayed" badge, TURN over 443 |
| 7 | Any | Relay-only mode | Both peers relayed, IP not exposed (check candidate types in debug panel) |
| 8 | 6 video + 6 audio participants | Mixed | CPU, quality, bitrate policy, AI notes on a laptop |

Record results in `docs/releases/vX.Y.Z.md`.

## 4. Release checklist

- [ ] All unit and e2e tests pass; `npm run check` clean; `npm audit --omit=dev` reviewed
- [ ] Bundle size within budget (`npx vite-bundle-visualizer` or build report)
- [ ] Lighthouse mobile: Performance, Accessibility, Best Practices at least 90
- [ ] Manifest installable with no DevTools warnings
- [ ] Manual matrix rows 1, 4, 5, 6 done at minimum
- [ ] No em-dash characters in UI strings (`grep` the build and `i18n`)
- [ ] Footer credit and links correct
- [ ] Privacy and Terms reviewed by Faisal
- [ ] Version bumped, PROGRESS.md updated, deploy approved
