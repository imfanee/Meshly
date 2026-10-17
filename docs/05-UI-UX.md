# 05 UI and UX

Meshly should feel calm, fast and trustworthy: a professional tool, not a toy. One codebase adapts between a desktop layout (pointer, wide screen) and a mobile layout (touch, narrow screen). Keep it simple: every screen has one obvious primary action.

## 1. Design direction

- **Personality:** quiet confidence. Dark, focused call view; light-or-dark (system preference) for everything else.
- **Signature motif:** the mesh. The logo is four nodes joined by six lines (a square with both diagonals). Echo it subtly: the connection badge, the empty-room illustration (nodes that light up as people join), and loading states (nodes drawing their links).
- **Avoid:** gradients everywhere, glassmorphism, stock illustrations, emoji in UI chrome, more than one accent colour.

## 2. Design tokens

Define as CSS custom properties consumed by Tailwind v4 `@theme`.

### Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#F6F8FA` | `#0B1117` | Page background |
| `--surface` | `#FFFFFF` | `#111A22` | Cards, panels, tiles |
| `--surface-2` | `#EEF2F5` | `#1A2530` | Inputs, hover, control buttons |
| `--border` | `#DDE3E9` | `#24323F` | Dividers, outlines |
| `--text` | `#0F1720` | `#E6EDF3` | Primary text |
| `--text-muted` | `#5B6B7A` | `#8B9BA8` | Secondary text |
| `--brand` | `#0E9F8E` | `#2DD4BF` | Primary buttons, focus ring, active states, logo |
| `--brand-strong` | `#0B7F72` | `#5EEAD4` | Hover/pressed |
| `--on-brand` | `#FFFFFF` | `#04211D` | Text on brand |
| `--danger` | `#DC2626` | `#F87171` | Leave, end, recording dot |
| `--warning` | `#B45309` | `#FBBF24` | Relayed connection, poor quality |
| `--success` | `#15803D` | `#4ADE80` | Good connection |

The call view always uses the dark palette regardless of system theme (video looks best on dark). Check contrast: text on surfaces at least 4.5:1; large text and icons at least 3:1.

### Type

- Inter variable, self-hosted (`/fonts/InterVariable.woff2`, `font-display: swap`), fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Scale (px): 12, 14, 16 (body), 18, 20, 24, 32, 40 (home hero only). Weights 400, 500, 600.
- Numerals: `font-variant-numeric: tabular-nums` for timers and stats.

### Shape, space, motion

- Spacing scale 4 px base: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 8 (inputs, small buttons), 12 (cards, tiles), 999 (control buttons, pills).
- Control buttons: 48 px circle desktop, 56 px mobile; icons 22 to 24 px.
- Motion: 150 to 200 ms ease-out for UI; tile reflow 250 ms; respect `prefers-reduced-motion` (no animated layout, no node animations).
- Elevation: borders over shadows; one soft shadow for dialogs and popovers only.

## 3. Brand assets

- `app/public/icons/logo.svg`: the mesh mark (four nodes, six links) in `--brand` on a `#0B1117` rounded square (radius 22% of size). Node circles slightly larger than line weight.
- Wordmark: "Meshly", Inter 600, letter-spacing -0.01em, next to the mark.
- Generate PWA icons with `@vite-pwa/assets-generator` from `logo.svg`: 64, 192, 512, maskable 512 (mark inside the safe zone, 80%), Apple touch 180, favicon.
- Open Graph image `og.png` 1200 x 630: dark background, mark, "Meshly", tagline "Private meetings, peer to peer." Used for link previews in WhatsApp, LinkedIn, Slack.

## 4. Screens

### 4.1 Home (`/`)

Desktop: two columns. Left: hero "Private meetings, peer to peer." with sub "No sign-up. No servers in the middle. Free." Right: card with:

- Name field ("Your name"), primary button "Start a meeting".
- Divider "or".
- "Join with a link" input + "Join" button (accepts full link).

Below the fold (short): three feature points with small line icons (Direct and encrypted, Works in your browser or as an app, Bring your own AI notes), and "How it works" in three steps. Install button in the top bar (see section 6). Footer (section 7).

Mobile: single column, the card first, hero text above it in smaller type, features collapsed.

### 4.2 Pre-join (`/r/:roomId` before joining, and for the host after "Start")

- Large camera preview (mirrored), name overlay, mic level meter.
- Toggles under preview: mic, camera. Device menus: microphone, camera, speaker (where `setSinkId` exists).
- Name field (prefilled from last time).
- Primary: host "Start meeting"; guest "Ask to join".
- Link card (host only): link with Copy, Share, QR.
- Permission states: prompt explainer before first `getUserMedia` ("Meshly needs your camera and microphone. Your video goes directly to other participants."), denied state with per-browser instructions, no-devices state with "Join without camera".

### 4.3 Lobby (guest waiting)

Preview stays visible (smaller). Status card: animated mesh nodes, "Waiting for the host to let you in", room name hidden (no info leak), Cancel button. Sub-states: "The host is not here yet", "Denied", "Meeting full", "Meeting locked".

### 4.4 Call

**Top bar (auto-hides after 3 s of no pointer movement on desktop; always visible on mobile in a compact form):** meeting timer, participant count, recording pill (red dot + "Recording"), AI notes pill, connection summary, Copy link.

**Stage layouts:**

| Layout | When | Arrangement |
| --- | --- | --- |
| Grid | Default on desktop | 1: full; 2: side by side; 3 to 4: 2 x 2; 5 to 6: 3 x 2. 16:9 tiles, contain within viewport, gap 8 px |
| Speaker | Default on mobile, toggle on desktop | Active speaker large; others in a filmstrip (bottom on mobile portrait, right on desktop) |
| Screen | Auto when someone shares | Screen large (contain, never crop); camera tiles in filmstrip |

Audio-only participants (no video slot or camera off) render as avatar tiles with initials on a colour derived from `peerId`, a speaking ring, mic state. When more than 6 tiles exist in grid mode, audio-only participants collapse into a strip "and 4 others" with avatars.

**Tile:** video (cover in grid, contain for screen), name label bottom-left, mic-off icon, raised-hand badge, connection badge (dot: green direct, amber relayed, red poor) with tooltip, speaking ring in `--brand`. Hover menu (desktop) or long-press (mobile): Pin, and for the host: Ask to mute, Remove.

**Control bar (bottom, centred):**

| Desktop order | Mobile (bar) | Mobile ("More" sheet) |
| --- | --- | --- |
| Mic, Camera, Share screen, Raise hand, Reactions, Chat, People, Notes, More, Leave | Mic, Camera, Chat, More, Leave | Raise hand, Reactions, People, Notes, Switch camera, Layout, Settings, Copy link, About |

- Host "More" adds: Record, Lock meeting, End for everyone.
- Leave (red pill). For the host it opens a menu: "Leave" (meeting continues) or "End for everyone".
- Badges on Chat (unread count) and People (knock count).

**Side panel (desktop 360 px, right; mobile full-height bottom sheet):** tabs Chat, People, Notes.

- Chat: messages grouped by sender, timestamps, links auto-detected (open in new tab, `rel="noopener noreferrer"`), file cards with progress and Save, composer with Enter to send, Shift+Enter newline.
- People: knock queue at top (Admit, Deny, Admit all), then participants with mic, camera, hand, connection, and host actions.
- Notes: AI notes setup or live transcript and notes (doc 06).

**Toasts:** bottom-left desktop, top mobile. Knock toasts persist until handled or 30 s. Join/leave toasts 3 s. All mirrored to an `aria-live="polite"` region.

### 4.5 Post-call

"You left the meeting" or "The host ended the meeting". Duration. If a recording exists and is not yet saved: prominent "Save recording". If AI notes exist: "Download notes (Markdown)". Buttons: "Rejoin" (if meeting still active and link known), "Start a new meeting", "Home".

### 4.6 Settings (dialog, desktop; full screen, mobile)

Sections: Audio and video (devices, mirror my video, noise suppression toggle), AI notes (providers, keys, models, remember toggle, test button, cost note), Appearance (theme system/light/dark), Advanced (relay-only privacy mode, show connection details, signalling transports Nostr/MQTT toggles), About (version, build date, credits, links, "How Meshly works").

### 4.7 About, Privacy, Terms

Static pages, readable width 680 px. About explains the architecture in plain language with a simple diagram (reuse the mesh motif) and the architect credit. Privacy and Terms content in doc 07.

## 5. Error and edge states (copy)

| Situation | Message |
| --- | --- |
| Incomplete link | "This meeting link is incomplete. Ask the host to send the full link." |
| Unsupported browser | "Your browser cannot make Meshly calls. Try the latest Chrome, Edge, Safari or Firefox." |
| In-app browser | "For camera access and to install the app, open this link in your browser." + Copy link |
| Camera blocked | "Camera is blocked. Allow it in your browser's site settings, then try again." + browser-specific steps |
| No relay reachable | "Cannot reach the meeting network. Check your internet connection." + Retry |
| Pair cannot connect | On tile: "Cannot connect to Sam directly. Trying the relay..." then "Connection failed" with Retry |
| Meeting full | "This meeting is full (12 people)." |
| Camera slots full | "All 6 camera slots are in use. You can still talk and listen." |
| Host ended | "The host ended the meeting." |
| Removed | "You were removed from the meeting." |
| Offline | "You are offline. Meshly will reconnect when you are back online." |
| Newer version in room | "Someone in this meeting is using a newer version of Meshly. Refresh to update." |

## 6. PWA install and update UX

### Install button logic

```
if (display-mode is standalone or navigator.standalone) -> hide all install UI
else if (beforeinstallprompt captured)                  -> show "Install app" button in top bar; on click call prompt()
else if (iOS Safari)                                     -> show "Install" button opening a sheet: 1. tap Share 2. tap Add to Home Screen (with icons)
else if (iOS non-Safari browser)                         -> sheet: "To install, open this page in Safari"
else if (macOS Safari 17+)                               -> sheet: File menu, Add to Dock
else                                                     -> no install UI (Firefox desktop)
```

- Never show a blocking install modal. A dismissible inline card on the Home screen ("Get the Meshly app: opens instantly, works like a native app") appears on the second visit; dismissal remembered for 30 days.
- After `appinstalled`, hide install UI and show a toast "Meshly installed".

### Manifest

| Field | Value |
| --- | --- |
| `name` / `short_name` | `Meshly` |
| `description` | `Private meetings, peer to peer. No servers, no sign-up.` |
| `id` | `/` |
| `start_url` | `/?source=pwa` |
| `scope` | `/` |
| `display` | `standalone` |
| `display_override` | `["window-controls-overlay", "standalone"]` |
| `theme_color` / `background_color` | `#0B1117` |
| `icons` | 192, 512, maskable 512 |
| `shortcuts` | `[{ "name": "New meeting", "url": "/?new=1" }]` |
| `categories` | `["business", "productivity", "social"]` |
| `screenshots` | 2 wide (desktop), 2 narrow (mobile) for the richer Chromium install dialog |

With `window-controls-overlay`, draw a 32 px custom title bar on desktop installed mode (logo, meeting timer during calls) using `env(titlebar-area-*)`, and make it draggable (`app-region: drag`, buttons `no-drag`).

### Updates

`vite-plugin-pwa` with `registerType: "prompt"`. When a new service worker is waiting:

- Not in a call: toast "A new version of Meshly is ready" with "Update" (calls `updateSW(true)`).
- In a call: defer; show the toast on the Post-call screen.
- Check for updates on launch and every 60 minutes while open.

## 7. Footer

On Home, Pre-join, Lobby, Post-call, About, Privacy, Terms:

> Meshly · Free private meetings · Architected by **Faisal Hanif** · [GitHub](https://github.com/imfanee) · [LinkedIn](https://www.linkedin.com/in/faisal-hanif-ai-telecom/) · About · Privacy · Terms · v1.0.0

Small (12 to 14 px), muted, wraps nicely on mobile. External links `target="_blank" rel="noopener noreferrer"`. In the call view the credit appears in More, About.

## 8. Keyboard shortcuts (desktop)

Active only when focus is not in a text field. Listed in a "?" dialog.

| Key | Action |
| --- | --- |
| M | Mute or unmute |
| V | Camera on or off |
| S | Share screen |
| H | Raise or lower hand |
| C | Open chat |
| P | Open people |
| N | Open notes |
| L | Cycle layout |
| Esc | Close panel or dialog |
| ? | Show shortcuts |

Space held for push-to-talk while muted (optional setting, off by default).

## 9. Accessibility checklist

- All controls are buttons with `aria-label` and `aria-pressed` for toggles; tooltips also on focus.
- Focus order: top bar, stage, control bar, side panel. Focus trapped in dialogs and sheets; returned on close.
- `aria-live` announcements: joins, leaves, knocks, hand raised, recording started/stopped, new chat message (debounced).
- Video tiles have accessible names ("Sam, camera on, muted").
- Minimum touch target 44 x 44 px. Text resizes to 200% without loss.
- Colour never the only signal (icons plus text for connection and recording states).
