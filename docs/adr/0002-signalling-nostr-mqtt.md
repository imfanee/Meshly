# ADR 0002: Own signalling over Nostr and MQTT

**Status:** Accepted (2026-10-17)

## Context

WebRTC needs a channel to exchange SDP and ICE candidates. The original idea was Firebase Cloud Messaging. Options considered:

| Option | Finding |
| --- | --- |
| FCM | HTTP v1 send API needs an OAuth token from a service account; the legacy key API is shut down. A service account in a public PWA would give anyone full send rights. Unusable without a server |
| Firebase Realtime Database (Spark) | Works, but hard cap of 100 simultaneous connections on the free plan: unsuitable as primary for a public service |
| Supabase Realtime (free) | Works, but free projects pause after inactivity |
| Public Nostr relays | Free, no account, many independent relays, ephemeral event kinds are forwarded without storage |
| Public MQTT brokers over WSS | Free, no account, simple pub/sub |
| Trystero library | Wraps these transports, but manages peer connections itself, which conflicts with host-gated admission, staged ICE control and perfect negotiation, and hides the engineering this project showcases |

## Decision

- Implement Meshly's own signalling hub with a transport interface and two production transports, Nostr (ephemeral kind 25050, `t` tag topic) and MQTT (QoS 0), used **in parallel** with dedupe.
- Encrypt (AES-GCM) and sign (ECDSA) every message at the application layer; relays see only an opaque topic hash.
- Keep a local dev relay transport for development and tests only.

## Consequences

- No single relay or broker failure breaks meetings; no split rooms because every client uses every transport.
- Dependence on public infrastructure we do not control; mitigated by multiple relays per transport and the spikes in Phase 0.
- More code than using Trystero, but full control over admission, negotiation and ICE, which is the point of the showcase.
