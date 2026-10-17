# Spike T0.3: Nostr relay suitability

Date: 2026-10-17. Script: `app/tools/spike-nostr.mjs` (nostr-tools 2.25.2, Node 24, GCP europe-north1).

Method: per relay, one WebSocket subscribes `{ kinds: [25050], "#t": [topic] }` while a second connection publishes 20 kind-25050 ephemeral events at 50 ms intervals. `accepted` counts relay OK acknowledgements; `delivered` counts events received back over the subscription; latency is publish-to-receipt.

## Results

| Relay | Connect | Accepted | Delivered | Median ms | p95 ms | Note |
| --- | --- | --- | --- | --- | --- | --- |
| wss://relay.primal.net | yes | 20/20 | 20/20 | 137 | 220 | solid both runs |
| wss://nos.lol | yes | 20/20 | 20/20 | 152 | 225 | solid both runs |
| wss://nostr.mom | yes | 20/20 | 20/20 | 150 | 247 | solid both runs |
| wss://nostr.oxtr.dev | yes | 15/20 | 15/20 | 151 | 321 | rejects above its rate limit; our burst (~20/s) exceeds the app's own 10/s budget, so acceptable |
| wss://offchain.pub | yes | 15/20 | 15/20 | 333 | 725 | loss under burst, higher latency; not chosen |
| wss://relay.damus.io | yes | 0/20 | 0/20 | n/a | n/a | rejects kind 25050: `error: internal error` |
| wss://relay.nostr.band | yes | 0/20 | 0/20 | n/a | n/a | second connection times out |
| wss://relay.nostr.bg | yes | 0/20 | 0/20 | n/a | n/a | connection failed |

## Decision

`VITE_NOSTR_RELAYS` updated (`.env.example`, `app/.env`, `app/.env.production`) to the four relays that accepted and forwarded kind 25050:

```
wss://relay.primal.net,wss://nos.lol,wss://nostr.mom,wss://nostr.oxtr.dev
```

Findings for the protocol implementation:

- Kind 25050 with a `#t` filter works on mainstream relays; no NIP-42 auth was required.
- Damus (a popular relay) does not accept the ephemeral kind, so transport fan-out across several relays is essential, which doc 03 already mandates.
- Per-relay rate limiting is real; the 10 events/s per client ceiling in doc 03 must be enforced by the hub, including ICE candidate batching.
- Median signalling latency of roughly 140 to 160 ms per hop fits comfortably inside the 5 s join budget.
