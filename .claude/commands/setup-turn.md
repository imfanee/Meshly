---
description: Provision the coturn relay in a Proxmox LXC container (user-gated, step by step)
---

Follow `docs/09-TURN-PROXMOX.md` exactly. Never skip a stage, never run a write step without Faisal's "go" for that stage.

1. Confirm `.secrets/proxmox.json` and `.secrets/proxmox_key` exist and the key ACL is fixed. Confirm the TURN domain and that the DNS `A` record points at the Proxmox public IP (`nslookup turn.<domain>`).
2. Stage A (read-only): upload and run `infra/turn/discover.sh`. Save output to `.secrets/proxmox-discovery.txt`. Summarise for Faisal: Proxmox version, free CT ID, storage, existing bridges and subnets, ports in use, firewall state. Propose CT ID, bridge name, subnet and container IP.
3. Stage B (host network, gated): `host-setup.sh preflight`, then `host-setup.sh network`. Open a NEW SSH connection to prove access, then `host-setup.sh disarm`.
4. Stage C (NAT, gated): `host-setup.sh nat`.
5. Stage D (container, gated): `host-setup.sh container`, then push and run `infra/turn/container-setup.sh` inside it with `.secrets/turn.env`.
6. Stage E: run the verification checklist in `docs/09-TURN-PROXMOX.md` (ports, certificate, relay candidate via Trickle ICE, container isolation).
7. Stage F: update `app/.env.production` (`VITE_OWN_STUN_URL`), render `.secrets/meshly-config.php`, deploy it (gated), and record everything (without IPs) in PROGRESS.md.
