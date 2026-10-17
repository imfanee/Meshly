# Architecture decision records

Decisions made by the architect. Changing one requires Faisal's approval (AGENTS.md section 8). New ADRs use the next number and the same format: Context, Decision, Consequences, Status.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-static-pwa-no-backend.md) | Static PWA on cPanel, no application backend | Accepted |
| [0002](0002-signalling-nostr-mqtt.md) | Own signalling over Nostr and MQTT (not FCM, not Trystero) | Accepted |
| [0003](0003-full-mesh-limits.md) | Full mesh with 6 video and 12 total participants | Accepted |
| [0004](0004-staged-ice.md) | Staged ICE: free STUN first, own TURN on demand | Accepted |
| [0005](0005-frontend-stack.md) | Svelte 5, TypeScript, Vite, Tailwind | Accepted |
| [0006](0006-byo-ai-client-side.md) | Bring-your-own-key AI, client-side, opt-in per participant | Accepted |
| [0007](0007-host-signed-admission.md) | Host-signed admission tickets and room state | Accepted |
| [0008](0008-turn-in-lxc.md) | coturn in an unprivileged Proxmox LXC behind host NAT | Accepted |
