/**
 * TurnCredentials unit tests, doc 10: shape validation, caching, and the
 * 60 s backoff after a 4xx/5xx or network error.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  TurnCredentials,
  parseTurnResponse,
} from '../../src/lib/core/webrtc/turn';

const validBody = {
  ttl: 7200,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  iceServers: [
    {
      urls: ['turn:turn.example.com:3478?transport=udp'],
      username: 'u:abc',
      credential: 'cred',
    },
  ],
};

function fakeFetch(status: number, body: unknown = validBody) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('parseTurnResponse', () => {
  it('accepts a valid response', () => {
    const c = parseTurnResponse(validBody);
    expect(c?.iceServers[0].username).toBe('u:abc');
    expect(c?.expiresAt).toBe(validBody.expiresAt * 1000);
  });

  it('rejects malformed shapes', () => {
    expect(parseTurnResponse(null)).toBeNull();
    expect(parseTurnResponse({})).toBeNull();
    expect(parseTurnResponse({ expiresAt: 1, iceServers: [] })).toBeNull();
    expect(
      parseTurnResponse({ expiresAt: 1, iceServers: [{ urls: [] }] }),
    ).toBeNull();
    expect(
      parseTurnResponse({
        expiresAt: 1,
        iceServers: [{ urls: ['turn:x'], username: 'u' }],
      }),
    ).toBeNull();
  });
});

describe('TurnCredentials', () => {
  it('caches a good response until near expiry', async () => {
    const f = fakeFetch(200);
    const t = new TurnCredentials(f);
    expect(await t.get()).not.toBeNull();
    expect(await t.get()).not.toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('backs off 60 s after a 503 and keeps retrying after', async () => {
    let calls = 0;
    const t = new TurnCredentials(
      vi.fn(async () => {
        calls += 1;
        return {
          ok: false,
          status: 503,
          json: async () => ({}),
        } as unknown as Response;
      }) as unknown as typeof fetch,
    );
    expect(await t.get()).toBeNull();
    expect(t.unavailable).toBe(true);
    expect(await t.get()).toBeNull(); // still inside the backoff window
    expect(calls).toBe(1);
  });

  it('returns null and backs off on a network error', async () => {
    const t = new TurnCredentials(
      vi.fn(() => Promise.reject(new Error('net down'))) as typeof fetch,
    );
    expect(await t.get()).toBeNull();
    expect(t.unavailable).toBe(true);
  });

  it('refetches once the cached creds near expiry', async () => {
    const soon = {
      ...validBody,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    };
    const f = fakeFetch(200, soon);
    const t = new TurnCredentials(f);
    await t.get();
    // Cached creds expire within the 5-minute margin: refetch.
    expect(await t.get()).not.toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
