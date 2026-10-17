/**
 * Transport contract, doc 03 section 7. All signalling transports carry the
 * encrypted outer payload as an opaque string.
 */

export type TransportStatus = 'connecting' | 'open' | 'degraded' | 'closed';

export interface SignallingTransport {
  readonly name: 'nostr' | 'mqtt' | 'dev';
  connect(topic: string): Promise<void>;
  publish(payload: string): Promise<void>;
  /** Returns an unsubscribe function. */
  onMessage(cb: (payload: string) => void): () => void;
  status(): TransportStatus;
  close(): Promise<void>;
}
