# ADR 0003: Full mesh with 6 video and 12 total participants

**Status:** Accepted (2026-10-17)

## Context

Without a media server (SFU), every participant sends its media to every other participant. Uplink and encoder load grow with the number of peers: at 720p, 6 participants mean 5 outgoing video streams (about 6 Mbit/s); phones overheat beyond that.

## Decision

- Full-mesh WebRTC, no SFU.
- Hard caps: 6 participants may send camera video at once (video slots managed by the host); 12 participants in total, the rest audio-only.
- Adaptive bitrate and resolution by number of video senders (doc 04).

## Consequences

- Meetings stay backend-free and end-to-end encrypted without insertable streams.
- Not suitable for large meetings; an optional SFU mode could be added later as a separate ADR.
- Audio-only seats keep larger discussions possible at low cost (about 40 kbit/s per peer).
