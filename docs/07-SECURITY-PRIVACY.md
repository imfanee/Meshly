# 07 Security and privacy

Media and data are end-to-end encrypted by WebRTC (DTLS-SRTP) between peers. The design work is in protecting the parts WebRTC does not: the public signalling channel, admission, TURN credentials, the browser environment (CSP), and honest consent for recording and AI.

## 1. Assets

| Asset | Where it exists |
| --- | --- |
| Meeting media and chat | Participants' devices only (and TURN relay, encrypted, when relayed) |
| Room secret | Link fragment, participants' memory |
| Host signing key | Host device IndexedDB, non-extractable, 24 h |
| AI provider keys | User device, memory or IndexedDB (opt-in) |
| TURN shared secret | cPanel home folder config, coturn config, `.secrets/` on the dev machine |
| Recordings and notes | User's own disk |

## 2. Threat model

| # | Threat | Mitigation |
| --- | --- | --- |
| T1 | Relay operator or eavesdropper reads signalling | AES-256-GCM with key from room secret (HKDF); relays see only an opaque topic hash |
| T2 | Attacker forges or modifies signalling (SDP swap, fake admit) | Every envelope ECDSA-signed; admits and state signed by host key whose thumbprint is in the link; AAD binds ciphertext to topic |
| T3 | Replay of old signalling | 60 s timestamp window + LRU of seen message ids + ICE restart generations |
| T4 | Uninvited joiner without the link | Cannot derive topic or key; cannot even find the room |
| T5 | Someone with a forwarded link joins | Must knock; host admits; lock and remove available |
| T6 | Admitted peer impersonates host | Host-only messages verified against host thumbprint; tickets bind role |
| T7 | Kicked peer reconnects with same identity | `kicked` list in signed state; peers refuse its ticket |
| T8 | DoS flood on topic | Per-sender rate limits in the hub (drop over 20 msgs/s per `from`), size limits, invalid signatures dropped before any work beyond decrypt |
| T9 | TURN abuse (free relay for others) | Credentials via HMAC, 2 h expiry, issued only same-origin, per-IP rate limit; coturn quotas and bandwidth caps; secret rotation kills all credentials |
| T10 | TURN used to reach internal networks (SSRF style) | coturn `denied-peer-ip` for all private, loopback, link-local and CGNAT ranges; host firewall drops traffic from the container to the host; container isolated on its own bridge |
| T11 | XSS steals AI keys or room secret | No HTML rendering of user content; strict CSP (`script-src 'self'`); no third-party scripts; Svelte escaping; link detection builds text nodes |
| T12 | Malicious file transfer | Never auto-open; sanitise file names; show size and type; user must Accept and Save |
| T13 | IP address exposure to other participants | Inherent to P2P; disclosed in Privacy; relay-only mode available |
| T14 | Covert recording or transcription | Recording state in signed host state with persistent banner and chime; AI notes require per-person opt-in |
| T15 | Supply chain (npm) | Lockfile, minimal dependencies, `npm audit` in CI-style check before deploy, no install scripts from unknown packages |
| T16 | Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| T17 | Stale app with vulnerable code | Service worker update prompt; protocol version check |

### Limitations stated honestly (in About and Privacy)

- Meshly verifies people by the host admitting them, not by accounts. Anyone with the link can knock.
- In a mesh, participants learn each other's IP addresses unless relay-only mode is on.
- Public relays could observe that some encrypted traffic exists for a topic and when.

## 3. Content Security Policy

Set in `infra/cpanel/.htaccess`:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob: mediastream:;
font-src 'self';
connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*;
worker-src 'self' blob:;
manifest-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

- `connect-src https: wss:` is broad on purpose: users may point AI notes at any OpenAI-compatible endpoint, and relay lists can change. The real protection is `script-src 'self'` (no injected code can run) and having no third-party scripts.
- `localhost` entries allow local AI servers (Ollama, LM Studio).
- `wasm-unsafe-eval` only for local Whisper (phase 6); remove if that feature is dropped.
- `style-src 'unsafe-inline'` tolerates Svelte style directives; acceptable because scripts are locked down.

Other headers: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (meeting paths never leak via Referer), `Permissions-Policy` limiting camera, mic, display capture, wake lock to self, `Cross-Origin-Opener-Policy: same-origin`.

## 4. Secure coding rules for the agent

- Use WebCrypto only (no JS crypto libraries) for HKDF, AES-GCM, ECDSA, SHA-256, random.
- Keys non-extractable wherever possible. Never log keys, secrets, SDP (contains fingerprints and IPs) or tickets outside the opt-in debug panel.
- Validate every inbound message with type guards; reject unknown fields' types, oversize strings, and unexpected `t`.
- Escape everything rendered; never use `{@html}` with user or peer data.
- Constant-time compare not required (no server-side secret comparison in JS), but PHP uses `hash_equals` where comparing.

## 5. GDPR and UK GDPR position

- Meshly (Faisal as provider of the website) does not collect or store personal data on its servers. Apache access logs on cPanel record IP addresses and request paths (room IDs, but never secrets); retention per the hosting provider. State this.
- Processors and third parties: hosting provider (static files and access logs), public Nostr relays and MQTT brokers (encrypted, transient), STUN providers (Google, Cloudflare: see IP addresses), own TURN relay (sees IP addresses and encrypted media when used), user-chosen AI provider (only for note-takers and consenting participants).
- No cookies; local storage is strictly necessary or user-requested, so no cookie banner is needed.
- Recording and transcription legality is the user's responsibility; the app enforces notice (recording) and consent (AI).

## 6. Privacy notice (draft for `/privacy`)

> **Privacy at Meshly**
>
> Meshly is a free meeting app. It has no accounts and no tracking.
>
> **What we do not collect.** We do not store your name, your meetings, your messages, your recordings or your notes. There are no analytics or advertising cookies.
>
> **How your call travels.** Audio, video, chat and files go directly between participants' devices and are encrypted. To set up a call, your browser exchanges encrypted messages through public relay networks (Nostr and MQTT); they cannot read them. To find a direct route, your browser contacts public STUN servers run by Google and Cloudflare, which see your IP address. If a direct route is impossible, your call is relayed, still encrypted, through a relay server we operate, which sees your IP address but not the content.
>
> **Other participants** can see your IP address, as with any peer-to-peer call, unless you turn on "Hide my IP address" in Settings.
>
> **Our web host** keeps standard server logs (IP address, time, page requested) for security. The secret part of a meeting link never reaches our server.
>
> **On your device** Meshly stores your display name, settings, and, only if you choose, your AI keys. You can clear them in Settings or by clearing site data.
>
> **AI notes** are optional. If someone uses AI notes, you are asked first; if you allow it, your voice is sent to their chosen AI provider under that provider's terms.
>
> **Recording** can only be done by the meeting host, on their own device. Everyone is notified while recording is on.
>
> Contact: via GitHub https://github.com/imfanee

## 7. Terms (draft for `/terms`)

> Meshly is provided free, as is, without warranty or uptime guarantee. Do not use it for unlawful purposes, to harass others, or to record people without the notice and consent your local law requires. Do not use it for emergency communications. The service may change or stop at any time. Meshly is designed and architected by Faisal Hanif.

Faisal reviews both drafts before launch (user gate).
