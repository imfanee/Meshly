# 04 Media, mesh and ICE

Each participant holds one `RTCPeerConnection` per remote participant (full mesh, at most 11). Negotiation uses the W3C "perfect negotiation" pattern. ICE starts with free public STUN only and escalates a pair to our own TURN only when that pair cannot connect.

## 1. Peer manager

`PeerManager` owns a `Map<peerId, Peer>`. A `Peer` wraps one `RTCPeerConnection`, its `ctl` data channel, ICE state, stats and the remote peer's tracks.

### Who offers

- When a guest is admitted, it receives the roster and is the **initial offerer** to every existing member.
- Existing members create their `RTCPeerConnection` for the newcomer only after verifying its ticket in `hello`, then wait for the offer.
- After that, either side may renegotiate (adding screen share, ICE restart). Glare is resolved by perfect negotiation.

### Perfect negotiation

- `polite = localPeerId > remotePeerId` (string comparison). Exactly one side of each pair is polite.
- Implement the standard pattern: `makingOffer` flag, `ignoreOffer = !polite && offerCollision`, `setLocalDescription()` without arguments, `onnegotiationneeded` drives offers, `onicecandidate` feeds the ICE batcher.
- Reference: W3C WebRTC 1.0 spec, section "Perfect negotiation example". Unit-test glare with two in-memory peers (mock signalling, real `RTCPeerConnection` in Playwright, or `wrtc`-free logic tests with stubs).

### Transceivers

Per peer, create in this order on the offerer so `mid`s are stable:

1. `audio` sendrecv (microphone)
2. `video` sendrecv (camera; `sender.track` may be null when camera is off or no slot)
3. `video` added on demand for screen share (sendonly from sharer)

Camera on/off uses `sender.replaceTrack(track | null)`, which needs no renegotiation. The `tracks` control message tells peers which `mid` is camera and which is screen.

### Lifecycle and cleanup

- Remove a peer on `bye`, `kick`, or when `connectionState` stays `failed` after the full ICE strategy (below) for 15 s.
- On remove: close data channels, `pc.close()`, release audio elements and analysers, delete from map, announce via `aria-live`.

## 2. Local media

| Setting | Value |
| --- | --- |
| Audio constraints | `echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1` |
| Camera constraints | `width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: "user"` |
| Screen | `getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: true })` (audio ignored where unsupported); `track.contentHint = "detail"` |
| Device switching | `enumerateDevices` + `devicechange` listener; switch with `replaceTrack` on every peer's sender |
| Mobile camera flip | Toggle `facingMode` user/environment, then `replaceTrack` |
| Wake lock | `navigator.wakeLock.request("screen")` during calls; re-acquire on `visibilitychange` |
| Autoplay | Remote audio via one hidden `<audio>` per peer; if `play()` rejects (iOS), show "Tap to turn on sound" overlay |
| iOS video | `playsinline`, `muted` on local preview, `autoplay` |

## 3. Bitrate and resolution policy

Applied per sender with `RTCRtpSender.setParameters` whenever participant count or video slots change. Count `n` = number of remote peers receiving my camera.

| Video senders in room | Camera `maxBitrate` | `scaleResolutionDownBy` | `maxFramerate` |
| --- | --- | --- | --- |
| 1 to 2 | 1,500 kbps | 1 (720p) | 30 |
| 3 to 4 | 800 kbps | 1.5 (480p) | 24 |
| 5 to 6 | 450 kbps | 2 (360p) | 20 |
| Pair relayed via TURN | min(above, 500 kbps) | at least 2 | 20 |
| Screen share | 1,500 kbps (1,000 when relayed) | 1 | 15 |
| Audio | Opus default (about 32 to 40 kbps) | | |

- Pause sending (`active: false` on the encoding) to a peer that has my tile off-screen for over 10 s (peer tells me via `media` hints); resume immediately when visible. Phase 2 optimisation.
- Codec preference: leave browser default (VP8 in practice, universally supported). If every peer supports VP9, prefer it via `setCodecPreferences` (phase 6 optimisation, measure first).
- No simulcast (pointless without an SFU).

## 4. Staged ICE: STUN first, TURN on demand

Goal: never use or even request TURN unless a specific pair needs it, so free STUN carries most calls and our relay only carries the hard cases.

### Stage 1: STUN only (default)

```ts
iceServers = [{ urls: config.stunUrls }]        // Google + Cloudflare (+ own STUN once live)
iceTransportPolicy = "all"
iceCandidatePoolSize = 0
```

ICE gathers host and server-reflexive candidates. Most home and mobile pairs connect directly.

### Escalation trigger (per pair)

Escalate a pair to Stage 2 when any of these happens:

- `pc.iceConnectionState === "failed"`, or
- the pair has both descriptions set and is not `connected` within `VITE_ICE_ESCALATE_MS` (8,000 ms), or
- the remote peer sends a `ice` batch with `restart > localRestart` and a flag `relay: true` (remote already escalated; join it).

### Stage 2: add TURN and restart ICE

1. Get credentials from `TurnCredentials.get()`:
   - Cached in memory until 5 minutes before `expiresAt`.
   - `fetch(config.turnCredentialsPath, { credentials: "same-origin", cache: "no-store" })`.
   - 200: use the returned `iceServers`. 403/404/429/503 or network error: mark TURN unavailable for 60 s, show the tile warning (doc 02, section 6), keep Stage 1 and retry ICE restart every 30 s.
2. `pc.setConfiguration({ ...current, iceServers: [...stun, ...turn] })`.
3. `pc.restartIce()`; perfect negotiation sends the new offer. Increment local `restart` generation; the `ice` batches carry it so stale candidates are ignored.
4. Only the escalating side needs TURN credentials. One relayed side is enough for most NAT combinations. If the pair still fails within 10 s, ask the remote side to escalate too (`ice` message with `relay: true`).

### Disconnected handling

- `iceConnectionState === "disconnected"` for more than 4 s: `restartIce()` with the current configuration (network change, Wi-Fi to 4G).
- Still not connected 8 s after that restart: apply the escalation trigger.

### Relay-only privacy mode

Settings, Advanced: "Hide my IP address from other participants (uses the relay, may reduce quality)". Uses Stage 2 from the start with `iceTransportPolicy: "relay"`. If TURN is unavailable, explain and refuse to join in this mode rather than silently leaking IPs.

### Why this is safe for quota

ICE already prefers direct pairs over relay pairs, but simply listing TURN from the start would allocate a relay on our server for every participant. Staging avoids those allocations and the credential request entirely for the majority of pairs.

## 5. TURN credential response

`GET /api/turn.php` returns:

```json
{
  "ttl": 7200,
  "expiresAt": 1792000000,
  "iceServers": [
    {
      "urls": [
        "turn:turn.example.com:3478?transport=udp",
        "turn:turn.example.com:3478?transport=tcp",
        "turns:turn.example.com:443?transport=tcp"
      ],
      "username": "1792000000:a1b2c3d4",
      "credential": "base64-hmac-sha1"
    }
  ]
}
```

Client validates shape before use. Implementation: `infra/cpanel/api/turn.php`; ops in doc 08 and 09.

## 6. Stats and connection indicator

Every 2 s per peer, `pc.getStats()`:

- Selected candidate pair: `local-candidate.candidateType` and `remote-candidate.candidateType`. `relay` on either side shows the "Relayed" badge; otherwise "Direct".
- `currentRoundTripTime`, `inbound-rtp` `packetsLost`/`packetsReceived` delta, `jitter`.
- Quality: good (RTT under 150 ms and loss under 2%), fair (RTT under 300 ms and loss under 5%), poor otherwise.
- Debug panel (Settings, Advanced, "Show connection details") lists per peer: candidate types, protocol, RTT, loss, bitrate in/out, codec, resolution, ICE restarts, escalations. Nothing is ever sent anywhere.

## 7. Active speaker

Per remote audio track, a Web Audio `AnalyserNode` (one shared `AudioContext`). Compute RMS every 100 ms; speaker = highest RMS above threshold for at least 300 ms with 1.5 s hold. Drives the speaking ring on tiles and the speaker layout. Local mic gets a level meter in the control bar and pre-join screen, plus a "You are muted" hint when speaking while muted.
