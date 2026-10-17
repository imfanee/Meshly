# 03 Signalling protocol (v1)

Signalling carries only knocks, admissions, room state before data channels exist, SDP and ICE. Every message is signed by its sender (ECDSA P-256) and encrypted with a key derived from the room secret (AES-256-GCM), then published to all configured transports at once.

## 1. Identifiers and link format

| Item | Format | Generation |
| --- | --- | --- |
| `roomId` | 10 characters, base58 (Bitcoin alphabet) | `crypto.getRandomValues` (about 58 bits) |
| `roomSecret` | 16 random bytes, base64url without padding (22 chars) | `crypto.getRandomValues` |
| Host key | ECDSA P-256 key pair, private key non-extractable | `crypto.subtle.generateKey` |
| `hostThumb` | First 16 bytes of SHA-256(host public key SPKI), base64url (22 chars) | |
| Participant key | ECDSA P-256 key pair per session (per tab) | |
| `peerId` | First 12 bytes of SHA-256(participant SPKI), base64url (16 chars) | Binds identity to key |

**Share link:** `https://<app-host>/r/<roomId>#<roomSecret>.<hostThumb>`

- The fragment is never sent in HTTP requests, never logged by Apache, never sent to relays.
- On load, parse with strict regex: `^/r/([1-9A-HJ-NP-Za-km-z]{10})$` and fragment `^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$`. Anything else: "This meeting link is incomplete".
- After parsing, call `history.replaceState` to keep the fragment (needed for reloads) but never render it in UI except in the Copy link action.

## 2. Key derivation

```
ikm      = roomSecret (16 bytes)
salt     = UTF-8("meshly/v1/" + roomId)
topicKey = HKDF-SHA256(ikm, salt, info="meshly/v1/topic", 32 bytes)
encKey   = HKDF-SHA256(ikm, salt, info="meshly/v1/aead", 32 bytes) -> AES-GCM-256 CryptoKey (non-extractable)
topic    = hex(topicKey)[0..32]   (32 hex chars, used as Nostr tag / MQTT topic suffix)
```

Relays and brokers only ever see `topic`, which reveals neither `roomId` nor the secret.

## 3. Wire format

Outer (what transports carry): base64url of `iv (12 bytes) || ciphertext+tag`, encrypted with `encKey`, AAD = UTF-8(`"meshly/v1/" + topic`).

Inner (plaintext JSON, max 16 KB):

```ts
interface Envelope {
  v: 1;
  id: string;        // 16 random bytes base64url, used for dedupe
  ts: number;        // sender epoch ms
  from: string;      // sender peerId
  to: string;        // recipient peerId or "*"
  t: MessageType;
  b: unknown;        // body, validated per type
  pk?: string;       // sender SPKI base64url (required on knock, hello, and first message to a new peer)
  sig: string;       // ECDSA P-256 SHA-256 signature (IEEE P1363) over canonical JSON of the envelope without "sig"
}
```

Canonical JSON: keys sorted lexicographically at every level, no whitespace, UTF-8. Implement and unit-test `canonicalJson()`.

### Receive pipeline (in order, drop silently on any failure)

1. Size under 24 KB (outer). Decode base64url, decrypt with `encKey`.
2. Parse JSON; validate shape and `v === 1`.
3. `to` is `"*"` or own `peerId`; `from` is not own `peerId`.
4. Replay: `|now - ts| <= 60 s` and `id` not in LRU of last 4,096 ids.
5. Resolve sender key: from `pk` (verify `peerId == hash(pk)`) or from cache of known peers.
6. Verify `sig`.
7. Type-specific authorisation (for example only the host key may sign `admit`, `state`, `kick`, `end`).
8. Dispatch.

## 4. Message types

| `t` | Direction | Body | Notes |
| --- | --- | --- | --- |
| `knock` | guest to `*` | `{ name, wantsVideo: boolean, ua: "desktop" or "mobile" }` + `pk` | Repeated every 5 s until `admit`/`deny`. Host dedupes by `peerId` |
| `admit` | host to guest | `{ ticket, roster: RosterEntry[], state: SignedRoomState }` + `pk` (host) | Guest verifies host `pk` hash equals `hostThumb` |
| `deny` | host to guest | `{ reason: "denied" or "full" or "locked" }` | Signed by host |
| `host-here` | host to `*` | `{ seq }` | Every 15 s, lets lobby show host presence |
| `hello` | member to `*` | `{ ticket, name, media: { audio, video } }` + `pk` | Sent once after admit; existing peers verify ticket |
| `sdp` | peer to peer | `{ description: RTCSessionDescriptionInit }` | Perfect negotiation, see doc 04 |
| `ice` | peer to peer | `{ candidates: RTCIceCandidateInit[], restart: number, relay?: boolean }` | Batched every 300 ms or 10 candidates; `restart` = ICE generation; `relay: true` asks the other side to escalate to TURN too (doc 04) |
| `state` | host to `*` | `SignedRoomState` | Only for peers without a data channel yet |
| `kick` | host to `*` | `{ peerId }` | Removed peer leaves; others close the PC |
| `end` | host to `*` | `{}` | Everyone leaves |
| `bye` | member to `*` | `{}` | Graceful leave |

Once a data channel to a peer is open, `state`, `kick`, `end` and `bye` are also sent over it, and SDP renegotiation for that pair moves to the data channel (faster, fewer relay messages). ICE restarts still work over signalling if the channel is down.

## 5. Admission tickets

```ts
interface Ticket {
  roomId: string;
  peerId: string;     // binds ticket to the guest's key
  name: string;
  role: "host" | "guest";
  iat: number;        // seconds
  exp: number;        // iat + 12 h
}
interface SignedTicket { ticket: Ticket; sig: string } // host ECDSA over canonical JSON of ticket
```

- The host issues itself a ticket with `role: "host"`.
- Peers accept a `hello`, `sdp` or `ice` from a peer only if that peer presented a valid ticket (signature by the host key whose thumbprint is in the link, matching `roomId` and `peerId`, not expired, not in the kicked set).
- A peer never sends media or data to an unverified peer. The PC is created only after ticket verification.

## 6. Signed room state

```ts
interface RoomState {
  roomId: string;
  seq: number;                       // strictly increasing
  hostPeerId: string;
  locked: boolean;
  roster: { peerId: string; name: string; role: "host" | "guest" }[];
  videoSlots: string[];              // peerIds allowed to send camera, max 6
  screenSharer: string | null;
  recording: boolean;
  noteTakers: string[];
  kicked: string[];
}
interface SignedRoomState { state: RoomState; sig: string }
```

Peers keep the highest valid `seq`. Video slot and screen share requests go to the host over the data channel (`slot-req`, `share-req`), and the host answers by publishing a new state.

## 7. Transports

All transports implement:

```ts
interface SignallingTransport {
  readonly name: "nostr" | "mqtt" | "dev";
  connect(topic: string): Promise<void>;
  publish(payload: string): Promise<void>;     // outer base64url string
  onMessage(cb: (payload: string) => void): () => void;
  status(): "connecting" | "open" | "degraded" | "closed";
  close(): Promise<void>;
}
```

`SignallingHub` connects all enabled transports in parallel, publishes every outgoing message to all of them, and dedupes incoming messages by envelope `id`. A room never splits because every client uses every transport.

### 7.1 Nostr

- Library: `nostr-tools` (`SimplePool`).
- Each session generates a throwaway Nostr key (`generateSecretKey`). Nostr signatures are only for relay acceptance; app-level identity is the ECDSA key above.
- Event: `kind: 25050` (ephemeral range 20000 to 29999, relays forward but do not store), `tags: [["t", topic]]`, `content: <outer payload>`, `created_at: now`.
- Subscription filter: `{ kinds: [25050], "#t": [topic], since: now - 30 }`.
- Connect to the relays in `VITE_NOSTR_RELAYS` (start with 4). Treat the hub as open when at least one relay is connected.
- Spike T0.3 must confirm each candidate relay accepts and forwards kind 25050 with a `#t` filter, and measure median delivery latency. Replace relays that fail.
- Respect relay rate limits: at most 10 events per second per client; ICE batching keeps a 6-person join well under this.

### 7.2 MQTT

- Library: `mqtt` (browser build, WebSocket over TLS).
- Topic: `meshly/v1/<topic>`; QoS 0; `clean: true`; random client ID; no retained messages.
- Brokers from `VITE_MQTT_BROKERS`; connect to all, publish to all.
- Spike T0.4 confirms reachability and latency from the UK and from a mobile network.

### 7.3 Dev relay (development and tests only)

`app/tools/dev-relay.mjs`: a 40-line Node WebSocket server that rebroadcasts every message to all clients subscribed to the same topic. Enabled only when `VITE_DEV_RELAY_URL` is set. Never included in production builds (tree-shaken by `import.meta.env.DEV` guard and env check).

## 8. Data channel control protocol

One ordered, reliable `RTCDataChannel` per pair, label `ctl`, negotiated in-band, created by the offerer. Messages are JSON `{ t, id, ts, b }` (no extra crypto needed: DTLS already encrypts and authenticates the peer).

| `t` | Body |
| --- | --- |
| `state` | `SignedRoomState` (host relays to all) |
| `chat` | `{ text, to?: peerId }` |
| `react` | `{ emoji }` (fixed set of 8) |
| `media` | `{ audio: boolean, video: boolean, screen: boolean, hand: boolean }` |
| `tracks` | `{ mids: { camera?: string, screen?: string } }` maps transceiver mid to purpose |
| `slot-req` / `share-req` | `{}` to host |
| `mute-req` | host to peer `{}` (peer sees "The host asked you to mute"; never auto-muted) |
| `sdp` | renegotiation `{ description }` |
| `rec` | `{ on: boolean }` (also in state) |
| `notes-consent-req` | `{ noteTaker: peerId, name }` |
| `notes-consent` | `{ allow: boolean }` |
| `transcript` | `{ lines: { speaker, ts, text }[] }` (optional sharing) |
| `file-offer` | `{ fileId, name, size, mime }` |
| `file-accept` / `file-reject` | `{ fileId }` |
| `bye` | `{}` |

File bytes use a separate data channel per transfer (label `file:<fileId>`, ordered, reliable), 16 KB chunks, backpressure via `bufferedAmountLowThreshold = 1 MB`.

## 9. Versioning

`v: 1` in every envelope. A client receiving `v > 1` shows "Someone in this meeting is using a newer version of Meshly. Refresh to update." Breaking changes bump `v` and change the HKDF info strings.
