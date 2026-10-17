# ADR 0007: Host-signed admission tickets and room state

**Status:** Accepted (2026-10-17)

## Context

There is no server to enforce who may join, who is host, or who was removed. Anyone with the link can derive the signalling key, so encryption alone does not stop a forwarded link or a malicious participant from impersonating the host.

## Decision

- The host generates an ECDSA P-256 key per room; a thumbprint of its public key is part of the link fragment.
- The host admits guests by signing tickets bound to each guest's own key (`peerId` = hash of the guest's public key).
- Peers only negotiate with peers holding a valid ticket. Host-only messages (admit, deny, state, kick, end) must verify against the host key.
- Authoritative room state (roster, lock, video slots, recording, note-takers, kicked) is versioned and signed by the host.
- The host key is kept non-extractable in IndexedDB for 24 hours so the host can reload.

## Consequences

- Strong admission control without a server; removed peers cannot rejoin with the same identity.
- If the host's device is lost mid-meeting, nobody else can admit new guests (co-host delegation is an open question).
- Slightly more crypto work per message; negligible at meeting scale.
