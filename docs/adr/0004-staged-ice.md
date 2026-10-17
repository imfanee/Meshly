# ADR 0004: Staged ICE, free STUN first, own TURN on demand

**Status:** Accepted (2026-10-17)

## Context

Most peer pairs connect directly using STUN. Roughly 10 to 20% (symmetric NAT, corporate firewalls) need a TURN relay. Free TURN services are capped (for example Open Relay 20 GB per month). Faisal has a Proxmox host with a public IP and 500 Mbit/s for his own coturn, and wants free STUN used until it fails, with his TURN used only when necessary.

## Decision

- Start every peer connection with free public STUN only (Google, Cloudflare; later also our own STUN).
- Escalate a specific pair to TURN only on failure or after an 8 s connect timeout: fetch short-lived credentials from `/api/turn.php`, add TURN to the configuration, `restartIce()`.
- Relay-only privacy mode uses TURN from the start by user choice.
- TURN provider: own coturn on Proxmox (ADR 0008). Cloudflare Realtime TURN may be added later as a second credential source.

## Consequences

- No TURN allocations or credential requests for the majority of pairs; relay bandwidth stays small.
- Pairs that need TURN take a few extra seconds to connect; the UI explains it ("Trying the relay").
- Before coturn exists, `turn.php` returns 503 and those pairs fail with a clear message; acceptable during early development.
