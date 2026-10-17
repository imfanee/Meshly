/**
 * Dev-relay transport, doc 03 section 7.3: talks to tools/dev-relay.mjs over
 * a plain WebSocket. Only ever enabled by VITE_DEV_RELAY_URL; production
 * builds never see it configured.
 */

import type { SignallingTransport, TransportStatus } from './transport';

export class DevRelayTransport implements SignallingTransport {
  readonly name = 'dev' as const;
  private ws: WebSocket | null = null;
  private cbs = new Set<(p: string) => void>();
  private state: TransportStatus = 'connecting';
  private topic = '';

  constructor(private url: string) {}

  connect(topic: string): Promise<void> {
    this.topic = topic;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('dev-relay connect timeout'));
      }, 8_000);
      ws.onopen = () => {
        clearTimeout(timer);
        ws.send(JSON.stringify({ t: 'sub', topic }));
        this.state = 'open';
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        this.state = 'closed';
        reject(new Error('dev-relay unreachable'));
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data));
          if (m.t === 'msg' && typeof m.data === 'string') {
            for (const cb of this.cbs) cb(m.data);
          }
        } catch {
          /* hostile bytes: drop */
        }
      };
      ws.onclose = () => {
        if (this.state === 'closed') return;
        this.state = 'degraded';
        this.ws = null;
        // Reconnect with backoff while the transport stays open (T2.5).
        setTimeout(() => {
          if (this.state === 'degraded') void this.connect(this.topic);
        }, 2_000);
      };
    });
  }

  async publish(payload: string): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({ t: 'pub', topic: this.topic, data: payload }),
    );
  }

  onMessage(cb: (payload: string) => void): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  status(): TransportStatus {
    return this.state;
  }

  async close(): Promise<void> {
    this.state = 'closed';
    this.ws?.close();
    this.ws = null;
  }
}
