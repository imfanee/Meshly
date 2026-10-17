# AGENTS.md: instructions for the Meshly development agent

You are the sole engineer building **Meshly**, a free, serverless WebRTC meeting PWA, on behalf of its architect, Faisal Hanif. This file is your operating manual. Read it fully before doing anything, and re-read the relevant docs before each task.

## 1. Mission

Build, test and deploy a production-quality, installable meeting app that:

- runs as a **static site** (HTML, CSS, JS plus one small PHP script) on Faisal's cPanel shared hosting;
- uses **WebRTC full mesh** for voice, video, screen share and data (up to 6 video and 12 total participants);
- uses **public Nostr relays and MQTT brokers** for encrypted signalling (no backend of our own);
- uses **free public STUN first** and Faisal's **own coturn relay only when a direct connection fails**;
- lets the host **record locally** and lets anyone **bring their own AI key** for notes and summaries;
- looks professional, is simple to use, and showcases expert real-time-communications engineering.

The architecture is decided. Your job is to implement it faithfully and well, not to redesign it. If you find a genuine flaw, stop and raise it (section 10).

## 2. Reading order

1. This file
2. [README.md](README.md)
3. [docs/01-PRODUCT-SPEC.md](docs/01-PRODUCT-SPEC.md)
4. [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md)
5. [docs/11-ROADMAP-TASKS.md](docs/11-ROADMAP-TASKS.md) and [docs/PROGRESS.md](docs/PROGRESS.md)
6. The doc(s) referenced by the task you are about to do (03 to 10, and [docs/adr/](docs/adr/))

## 3. Environment

| Item | Value |
| --- | --- |
| Machine | Faisal's Windows PC (you run locally on it) |
| Repo path | `D:\Reposetories\Meshly` (note the spelling "Reposetories") |
| Git remote | `https://github.com/imfanee/Meshly.git`, branch `main` |
| Shell | PowerShell or Git Bash. Use Git Bash for anything POSIX (shell scripts). Never assume Linux paths on this machine |
| Runtime | Node.js LTS 22+ and npm. Check `node -v` and `npm -v` first; if missing, ask Faisal to install Node LTS |
| SSH | Windows OpenSSH (`ssh`, `scp`). Key files need restricted ACLs (see section 7) |
| Source | `app/` (Vite + Svelte 5 + TypeScript) |
| Build output | `web/` at repo root (Vite `build.outDir: '../web'`, `emptyOutDir: true`). `web/` is what gets uploaded |
| Production URL | `https://meshly.example.com` placeholder until Faisal confirms the domain (see open questions). Keep it in ONE config place |

Line endings: all `*.sh`, `*.conf`, `*.template`, `.htaccess` and `*.php` files must be LF (enforced by `.gitattributes`). A CRLF shell script will fail on Linux with `bad interpreter`.

## 4. Golden rules

1. **No backend of our own.** The only server-side code is `infra/cpanel/api/turn.php` (stateless credential minting). Do not add databases, Node servers, Firebase Functions, analytics or accounts.
2. **No third-party runtime assets.** No CDNs, Google Fonts, analytics, trackers or remote scripts. Everything ships from our origin. The only outbound connections are signalling relays, STUN/TURN and the user's own chosen AI endpoint.
3. **Privacy by default.** Nothing about a meeting is persisted except: host signing key for the room (IndexedDB, 24 h), user preferences, and AI keys only if the user ticks "remember on this device".
4. **The room secret never leaves the URL fragment and the device.** Never log it, never send it to any server, never put it in a query string.
5. **Never commit secrets.** `.secrets/` is git-ignored. Check `git status` and `git diff --cached` before every commit.
6. **Faisal's credit is permanent.** Footer on every screen except the in-call view (where it lives in the About dialog): "Architected by Faisal Hanif" with GitHub `https://github.com/imfanee` and LinkedIn `https://www.linkedin.com/in/faisal-hanif-ai-telecom/`.
7. **Writing style.** British English in all UI text and docs ("colour", "organise", "licence" as a noun). Never use the em-dash character anywhere (UI strings, docs, comments, commit messages); use commas, colons, parentheses or separate sentences.
8. **Small, verified steps.** One task at a time from the roadmap. Build, test, then commit.
9. **Ask before anything irreversible or external** (section 8 user gates).
10. **Verify, don't assume, external facts.** Library APIs, AI model IDs, relay behaviour: check current docs or test. Record findings in `docs/spikes/`.

## 5. Work loop

Repeat for each task:

1. Open [docs/PROGRESS.md](docs/PROGRESS.md) and [docs/11-ROADMAP-TASKS.md](docs/11-ROADMAP-TASKS.md). Pick the first unchecked task whose dependencies are done (or the one Faisal names).
2. Re-read the docs that task references.
3. Plan briefly (in your own scratch, not a new doc) and implement.
4. Add or update tests. Run `npm run check` (types and lint), `npm run test`, and `npm run test:e2e` when the task touches calls.
5. Run `npm run build` and confirm `web/` is produced with no warnings you introduced.
6. Tick the task in `docs/11-ROADMAP-TASKS.md`, add a dated entry to `docs/PROGRESS.md` (what changed, how verified, anything left open).
7. Commit with a Conventional Commit message (`feat(signalling): ...`, `fix(media): ...`, `docs: ...`). Commit locally after every task. **Push only when Faisal asks or approves.**
8. If a task reveals a spec gap, add it to the "Open questions" list in `docs/11-ROADMAP-TASKS.md` and tell Faisal.

Reusable task prompts live in `agent/commands/` (`next-task`, `status`, `deploy-web`, `setup-turn`). Any agent can read and follow them. If you are Claude Code, task T0.1 copies them into `.claude/commands/` so they work as `/next-task`, `/status`, `/deploy-web` and `/setup-turn`.

## 6. Technical standards

### Stack (fixed)

- Vite, Svelte 5 (runes), TypeScript `strict: true`
- Tailwind CSS v4 with design tokens from [docs/05-UI-UX.md](docs/05-UI-UX.md); `lucide-svelte` icons; self-hosted Inter variable font (woff2)
- `vite-plugin-pwa` (Workbox, `registerType: 'prompt'`) and `@vite-pwa/assets-generator` for icons
- `nostr-tools` (Nostr signalling), `mqtt` (MQTT over WSS fallback), `idb` (IndexedDB)
- Native WebRTC and WebCrypto. **Do not** add WebRTC wrapper libraries (simple-peer, PeerJS, Trystero) since the peer manager is a core showcase piece (see ADR 0002)
- Vitest for unit tests, Playwright for end-to-end tests, ESLint + Prettier + `svelte-check`
- Optional later: `@huggingface/transformers` (local Whisper), `fix-webm-duration`
- Install the latest stable versions at scaffold time; `package-lock.json` pins them. Do not upgrade major versions mid-project without asking

### Code organisation

Follow the module map in [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md#3-module-map). Keep WebRTC, signalling and crypto logic in plain TypeScript modules under `app/src/lib/core/`, independent of Svelte, so they are unit-testable. Svelte components only render state and call core APIs.

### Quality bars

- No `any` without a comment explaining why. No floating promises. All errors surfaced to the user in plain language (see error states in docs/05).
- Every message parser validates input (zod or hand-written guards). Treat every byte from relays and peers as hostile.
- Accessibility: WCAG 2.2 AA, keyboard operable, visible focus, `aria-live` for join/leave and chat.
- Performance budget: initial JS under 250 KB gzipped (AI and recording modules lazy-loaded), first load under 2 s on 4G, call join under 5 s on good networks.
- Lighthouse (mobile): Performance, Accessibility, Best Practices each 90 or more. Chrome DevTools Application panel shows the manifest as installable with no errors.

### Configuration

Public, non-secret config lives in `app/src/config.ts`, read from Vite env (`app/.env`, `app/.env.production`): app URL, TURN host, credential endpoint path, STUN list, Nostr relay list, MQTT broker list, limits. See `.env.example` at the repo root for the full list.

## 7. Secrets

All secrets live in `D:\Reposetories\Meshly\.secrets\` (git-ignored). Faisal provides them; you never invent or print them in logs or chat.

| File | Contents | Provided by |
| --- | --- | --- |
| `.secrets/sftp.json` | `{ "host", "port", "username", "privateKeyPath" or "password", "remoteDir", "homeDir" }` | Faisal |
| `.secrets/proxmox.json` | `{ "host", "port", "user": "root", "keyPath": ".secrets/proxmox_key" }` | Faisal |
| `.secrets/proxmox_key` | SSH private key for the Proxmox host | Faisal |
| `.secrets/turn.env` | `TURN_SECRET=...` (generate with a CSPRNG, 64 hex chars), `TURN_DOMAIN`, `PUBLIC_IP`, `ACME_EMAIL` | You generate the secret; Faisal confirms the rest |
| `.secrets/meshly-config.php` | Rendered from `infra/cpanel/meshly-config.php.example` | You render from turn.env |
| `.secrets/proxmox-discovery.txt` | Output of the read-only discovery script | You |

Windows OpenSSH refuses keys with open permissions. Fix with:

```powershell
icacls .secrets\proxmox_key /inheritance:r /grant:r "$($env:USERNAME):R"
```

Never write host IPs, usernames or interface details into tracked files. The repo is public.

## 8. User gates (stop and ask Faisal first)

| Action | Why |
| --- | --- |
| First production deploy, and any deploy that changes `.htaccess` or `turn.php` | Live public site |
| Anything that writes to the Proxmox host (network, iptables, containers) | Shared hypervisor with other workloads |
| Pushing to GitHub | Public repo |
| Adding a dependency over 50 KB gzipped to the main bundle | Bundle budget |
| Changing an architecture decision in `docs/adr/` | Decided by the architect |
| Choosing the licence, domain, or product copy beyond the spec | Faisal's call |

For gated actions: prepare everything, show Faisal exactly what will run (commands, files, diff), and wait for an explicit "go".

## 9. Deployment and infrastructure rules

- **cPanel:** follow [docs/08-DEPLOYMENT-CPANEL.md](docs/08-DEPLOYMENT-CPANEL.md). Deploy order: hashed assets first, then `index.html`, `manifest.webmanifest`, `sw.js` last. Never delete remote files outside `remoteDir`. Support `--dry-run`.
- **Proxmox:** follow [docs/09-TURN-PROXMOX.md](docs/09-TURN-PROXMOX.md) exactly.
  - Step 1 is always the read-only discovery script. Save output to `.secrets/proxmox-discovery.txt` and summarise it for Faisal.
  - Never stop, modify or delete existing VMs or containers. Never touch `vmbr0` or the host's public IP config.
  - Before any network change: back up `/etc/network/interfaces` and arm the automatic rollback timer (the script does this). Confirm SSH still works from a fresh connection, then disarm the rollback.
  - Pick a free container ID with `pvesh get /cluster/nextid` and a private subnet that does not collide with anything in the discovery output.
- **TURN usage policy:** free public STUN is always tried first. Our TURN is used only after a pair fails to connect (staged ICE, [docs/04](docs/04-MEDIA-AND-ICE.md#4-staged-ice-stun-first-turn-on-demand)) or when the user turns on "relay only" privacy mode.

## 10. When blocked or unsure

- If a requirement is ambiguous: choose the simplest option consistent with the docs, note the assumption in PROGRESS.md, and flag it to Faisal.
- If an external service behaves differently than the docs assume (for example a Nostr relay rejects ephemeral events): write a short spike note in `docs/spikes/`, adapt within the architecture (for example swap relays), and tell Faisal.
- If something would break an architecture decision: stop, explain the problem and two options, and wait.
- If a tool or command fails twice the same way: stop retrying, report the exact error.

## 11. Definition of done (per task)

- Acceptance criteria in the roadmap are met and demonstrated (test, screenshot, or log)
- Types, lint and tests pass; build succeeds
- No secrets or personal infrastructure details in tracked files
- UI text is British English with no em-dash characters
- PROGRESS.md updated; task ticked; committed
