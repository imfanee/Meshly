# ADR 0008: coturn in an unprivileged Proxmox LXC behind host NAT

**Status:** Accepted (2026-10-17)

## Context

Faisal's Proxmox host has a public IPv4 and 500 Mbit/s, but not enough storage for a new VM. Running coturn directly on the hypervisor would expose a large UDP range and risk relaying into internal services (Proxmox UI, SSH, other guests).

## Decision

- Run coturn in an unprivileged Debian LXC container (about 4 GB disk, 512 MB RAM) on a new private bridge.
- Host forwards only TURN ports (UDP/TCP 3478, TCP 443 to 5349, UDP 49160 to 49660, TCP 80 for ACME) using dedicated iptables chains, with hairpin NAT for relay-to-relay traffic and a rule dropping all container traffic to the host.
- coturn uses `use-auth-secret` with credentials from `turn.php`, denies private and reserved peer ranges, and caps bandwidth at 250 Mbit/s.
- Network changes are applied with an automatic 5-minute rollback until a fresh SSH session proves access.

## Consequences

- Strong isolation at almost no resource cost; easy to snapshot, stop or destroy.
- Host networking gains one bridge and one systemd unit; documented uninstall path.
- IPv4 only for now.
