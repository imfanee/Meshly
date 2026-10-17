/**
 * Transport selection, doc 03 section 7: the dev relay wins when configured
 * (local dev and e2e); otherwise Nostr and MQTT run in parallel. The transport
 * libraries are dynamic imports so the initial bundle stays under the 250 KB
 * gzip budget; they load only when a meeting starts.
 */

import type { SignallingTransport } from './transport';
import { config } from '../../../config';

export async function makeTransports(): Promise<SignallingTransport[]> {
  if (config.devRelayUrl) {
    const { DevRelayTransport } = await import('./devRelay');
    return [new DevRelayTransport(config.devRelayUrl)];
  }
  const [{ NostrTransport }, { MqttTransport }] = await Promise.all([
    import('./nostr'),
    import('./mqtt'),
  ]);
  return [
    new NostrTransport(config.nostrRelays),
    new MqttTransport(config.mqttBrokers),
  ];
}

export { SignallingHub } from './hub';
export type { Envelope } from './envelope';
