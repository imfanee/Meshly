# Spike T0.4: MQTT over WebSocket broker suitability

Date: 2026-10-17. Script: `app/tools/spike-mqtt.mjs` (mqtt.js 5.16.1, Node 24, GCP europe-north1).

Method: per broker, one client subscribes `meshly/v1/<probe-topic>` at QoS 0 while a second client publishes 20 messages at 50 ms intervals. QoS 0 gives no broker ACK, so `delivered` is the ground truth; latency is publish-to-receipt.

## Results

| Broker | Connect | Delivered | Median ms | p95 ms | Note |
| --- | --- | --- | --- | --- | --- |
| wss://broker.hivemq.com:8884/mqtt | yes | 20/20 | 36 | 39 | fastest, full delivery |
| wss://test.mosquitto.org:8081/mqtt | yes | 20/20 | 45 | 50 | full delivery |
| wss://broker.emqx.io:8084/mqtt | yes | 10/20 | 171 | 237 | consistent across two runs: drops bursts beyond about 10 msgs/s |
| wss://mqtt.eclipseprojects.io:443/mqtt | no | 0/20 | n/a | n/a | connack timeout, broker retired |
| wss://broker.mqtt.cool:1884/mqtt | no | 0/20 | n/a | n/a | connack timeout |

## Decision

`VITE_MQTT_BROKERS` updated (`.env.example`, `app/.env`, `app/.env.production`) to:

```
wss://broker.hivemq.com:8884/mqtt,wss://test.mosquitto.org:8081/mqtt,wss://broker.emqx.io:8084/mqtt
```

Findings for the protocol implementation:

- Two brokers deliver everything with under 50 ms median latency, comfortably inside the 5 s join budget.
- emqx enforces a publish rate cap near 10 msgs/s and silently drops the excess. The doc-03 per-client ceiling of 10 events/s already covers this, but the hub should smooth bursts (knock + admit + hello + offers during a fast join can cluster), so MQTT sends should be paced rather than fired back to back.
- Anonymous public brokers are a fragile dependency: two advertised brokers no longer exist. Fan-out to every transport (Nostr plus MQTT) remains essential, and this list will need periodic re-verification.
