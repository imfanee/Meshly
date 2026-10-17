/**
 * TURN credential client, doc 04 section 5: GET /api/turn.php, validated,
 * cached until five minutes before expiry, with a 60 s backoff after any
 * 4xx/5xx or network error so we never hammer the endpoint.
 */

import { config } from '../../../config';

export interface TurnCreds {
  expiresAt: number;
  iceServers: RTCIceServer[];
}

export type TurnStatus =
  | { kind: 'idle' }
  | { kind: 'ok'; creds: TurnCreds }
  | { kind: 'unavailable'; until: number };

const UNAVAILABLE_FOR_MS = 60_000;
const EXPIRY_MARGIN_MS = 5 * 60_000;

export function parseTurnResponse(raw: unknown): TurnCreds | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    ttl?: unknown;
    expiresAt?: unknown;
    iceServers?: unknown;
  };
  if (typeof r.expiresAt !== 'number' || !Array.isArray(r.iceServers)) {
    return null;
  }
  const servers: RTCIceServer[] = [];
  for (const s of r.iceServers) {
    if (!s || typeof s !== 'object') return null;
    const srv = s as {
      urls?: unknown;
      username?: unknown;
      credential?: unknown;
    };
    const urls =
      typeof srv.urls === 'string'
        ? [srv.urls]
        : Array.isArray(srv.urls)
          ? srv.urls.filter((u): u is string => typeof u === 'string')
          : null;
    if (
      !urls ||
      urls.length === 0 ||
      typeof srv.username !== 'string' ||
      typeof srv.credential !== 'string'
    ) {
      return null;
    }
    servers.push({
      urls,
      username: srv.username,
      credential: srv.credential,
    });
  }
  if (servers.length === 0) return null;
  return { expiresAt: r.expiresAt * 1000, iceServers: servers };
}

export class TurnCredentials {
  private status: TurnStatus = { kind: 'idle' };
  private pending: Promise<TurnCreds | null> | null = null;
  private listeners = new Set<(s: TurnStatus) => void>();
  private fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  onChange(cb: (s: TurnStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.status);
  }

  get state(): TurnStatus {
    return this.status;
  }

  /** True while a backoff window from a failed fetch is active. */
  get unavailable(): boolean {
    return this.status.kind === 'unavailable' && this.status.until > Date.now();
  }

  /**
   * Fetch (or reuse cached) TURN credentials. Returns null when the endpoint
   * is unavailable or the response is invalid.
   */
  async get(): Promise<TurnCreds | null> {
    if (this.status.kind === 'ok') {
      if (this.status.creds.expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
        return this.status.creds;
      }
      this.status = { kind: 'idle' };
    }
    if (this.unavailable) return null;
    this.pending ??= this.fetchNow().finally(() => (this.pending = null));
    return this.pending;
  }

  private async fetchNow(): Promise<TurnCreds | null> {
    try {
      const res = await this.fetchImpl(config.turnCredentialsPath, {
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'same-origin',
      });
      if (!res.ok) return this.fail();
      const creds = parseTurnResponse(await res.json());
      if (!creds) return this.fail();
      this.status = { kind: 'ok', creds };
      this.emit();
      return creds;
    } catch {
      return this.fail();
    }
  }

  private fail(): null {
    this.status = {
      kind: 'unavailable',
      until: Date.now() + UNAVAILABLE_FOR_MS,
    };
    this.emit();
    return null;
  }
}

export const turnCredentials = new TurnCredentials();
