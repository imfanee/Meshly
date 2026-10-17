# 01 Product specification

Meshly is a free, no-sign-up meeting app for small groups (up to 6 cameras, 12 people), delivered as an installable PWA with no backend of its own.

## 1. Goals

1. Anyone can start a meeting in under 10 seconds with only a display name, and share one link.
2. Guests join from the link with one tap after the host admits them.
3. Calls are private by construction: media is peer to peer and end-to-end encrypted; signalling is encrypted with a key that only exists in the link.
4. Running cost is zero beyond Faisal's existing cPanel hosting and Proxmox server.
5. The product and its public repo demonstrate expert real-time communications architecture.

### Non-goals

- Webinars, large meetings (over 12 people), or an SFU/MCU
- Accounts, contacts, calendars, persistent chat history
- Cloud recording, server-side transcription
- Native app store apps
- PSTN or SIP dial-in (possible future work, see open questions)

## 2. Users and roles

| Role | Who | Can |
| --- | --- | --- |
| Host | Person who created the meeting (holds the room's signing key) | Admit or deny guests, lock the room, remove participants, grant video slots, ask someone to mute, record, end the meeting for all |
| Guest | Anyone admitted via the link | Speak, use camera (if a video slot is free), share screen (desktop), chat, react, send files, use own AI notes |
| Note-taker | Any participant who enables AI notes with their own key | Transcribe consenting participants' audio and generate notes on their own device |

## 3. User stories and acceptance criteria

### Start and share

- **US-1** As a host I enter my name and press "Start meeting" so that a room is created instantly.
  - Name is 1 to 40 characters, trimmed, remembered on this device.
  - A pre-join screen shows camera preview, mic level meter and device pickers before entering.
  - Room link is shown with Copy and native Share (Web Share API where available) buttons, and a QR code.
- **US-2** As a host I can copy the meeting link at any time from inside the call.

### Join

- **US-3** As a guest I open the link, enter my name, preview my devices and press "Ask to join".
  - If the link is malformed or missing the fragment, show "This meeting link is incomplete" with a way to paste the full link.
  - While waiting: "Waiting for the host to let you in" with a cancel button. Knock retries every 5 s; after 2 minutes without a host, show "The host is not here yet" and keep waiting until cancelled.
- **US-4** As a host I see a toast and a sound for each knock with Admit and Deny buttons; multiple knocks queue in the People panel.
- **US-5** As a guest I see a clear message when denied, when the room is full, when the room is locked, or when the host ended the meeting.

### In call

- **US-6** Voice and video with mute, camera on/off, device switching without dropping the call, and on phones a front/back camera toggle.
- **US-7** Up to 6 participants may have video at once. Others join audio-only and see "Camera slots are full (6 of 6)"; when a slot frees, they can turn on their camera.
- **US-8** Total participants including host is capped at 12. The 13th knock gets "This meeting is full".
- **US-9** Screen sharing on desktop browsers; one sharer at a time; viewers on any device. Hidden on browsers without `getDisplayMedia`.
- **US-10** Text chat to everyone, emoji reactions, raise hand, and file transfer (up to 100 MB per file) peer to peer.
- **US-11** Connection indicator per participant: direct or relayed, plus a quality level (good, fair, poor) from round-trip time and packet loss.
- **US-12** If my network drops briefly, the call reconnects automatically (ICE restart) without rejoining.

### Host controls

- **US-13** Lock the room (no new knocks accepted), remove a participant, ask a participant to mute, end the meeting for everyone.
- **US-14** If the host reloads or the app restarts, they return as host (signing key kept in IndexedDB for 24 h).
- **US-15** If the host leaves without ending, the call continues; new guests wait in the lobby with "The host is away".

### Recording (host only)

- **US-16** The host can record the meeting as one mixed video file (or audio only) saved to their own device.
  - On Chromium desktop the host picks the file location before recording starts and data streams to disk.
  - Elsewhere the recording is buffered on the device and offered as a download when stopped.
  - Every participant sees a persistent "Recording" banner and hears a short chime when recording starts and stops.

### AI notes (bring your own key)

- **US-17** Any participant can add their own AI provider key in Settings (OpenAI, Anthropic, Google Gemini, OpenAI-compatible endpoint). The key is stored only on that device and only if "remember on this device" is ticked.
- **US-18** Enabling AI notes asks each other participant for consent ("Allow Faisal's AI notes to transcribe your voice?"). Only consenting participants' audio is transcribed. Default is decline after 30 s.
- **US-19** Live transcript with speaker names, rolling notes, and an end-of-meeting summary (summary, decisions, action items with owners, open questions), exportable as Markdown. Optionally shared with participants over the data channel.

### App and install

- **US-20** On first visit in a supporting browser, an "Install Meshly" button appears. On iOS a short guide explains Share then Add to Home Screen. Once installed, the button is hidden.
- **US-21** The installed app opens in its own borderless window (desktop) or full screen (mobile), loads instantly from cache, and shows "Update available" when a new version is deployed (never interrupting a call).
- **US-22** Desktop layout on large screens, mobile layout on phones, both in portrait and landscape.
- **US-23** Footer credit "Architected by Faisal Hanif" with GitHub and LinkedIn links on all non-call screens; About dialog in the call.

## 4. Non-functional requirements

| Category | Requirement |
| --- | --- |
| Capacity | 12 participants, 6 with video; tested at 6 video on a mid-range laptop and a mid-range Android phone |
| Join time | Under 5 s from "Ask to join" admit to first media on good networks with direct connectivity |
| Connectivity | Free STUN first; TURN escalation within 8 s of a failed pair; TURN over TLS on port 443 for restrictive firewalls |
| Audio quality | Opus with echo cancellation, noise suppression and auto gain; mouth-to-ear under 300 ms on direct paths |
| Video quality | Adaptive: 720p at 2 participants down to 360p at 5 or 6 |
| Privacy | No analytics, no cookies, no server-side storage, no third-party scripts |
| Security | Encrypted and authenticated signalling, host-signed admission, strict CSP, short-lived TURN credentials |
| Accessibility | WCAG 2.2 AA; all controls keyboard accessible; screen reader announcements for joins, leaves and chat |
| Performance | Initial JS under 250 KB gzipped; lazy-load AI, recording and file transfer modules |
| Browser support | Latest two versions of Chrome, Edge, Safari (macOS and iOS), Firefox, Samsung Internet |
| Offline | App shell loads offline and shows "You are offline" on the home screen |
| Localisation | English (UK) only at launch; all strings in one module (`app/src/lib/i18n/en-GB.ts`) to allow translation later |

## 5. Limits and constants

| Constant | Value |
| --- | --- |
| Max participants | 12 |
| Max video senders | 6 |
| Max screen shares at once | 1 |
| File transfer max size | 100 MB |
| Chat message max length | 2,000 characters |
| Display name | 1 to 40 characters |
| Knock retry interval | 5 s |
| Host key retention | 24 h |
| TURN credential lifetime | 2 h |
| ICE escalation timeout | 8 s |
| AI audio segment length | 20 s |

## 6. Out-of-the-box screens

Home, Pre-join, Lobby (waiting), Call, Post-call, Settings, About, Privacy, Terms, plus error states. Detailed in [05-UI-UX.md](05-UI-UX.md).
