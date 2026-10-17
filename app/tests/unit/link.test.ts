import { describe, expect, it } from 'vitest';
import {
  formatLink,
  isIncompleteLink,
  parseLink,
  randomRoomId,
  randomSecret,
} from '../../src/lib/core/room/link';

const APP = 'https://meshly.example.com';

describe('room link codec', () => {
  it('generates 10-char base58 room IDs', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(randomRoomId()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{10}$/);
    }
  });

  it('generates 22-char base64url secrets', () => {
    expect(randomSecret()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('round trips format and parse', () => {
    const room = {
      roomId: randomRoomId(),
      roomSecret: randomSecret(),
      hostThumb: randomSecret(),
    };
    const link = formatLink(APP, room);
    expect(parseLink(link)).toEqual(room);
  });

  it('parses a bare /r/ path plus fragment', () => {
    const room = {
      roomId: randomRoomId(),
      roomSecret: randomSecret(),
      hostThumb: randomSecret(),
    };
    expect(
      parseLink(`/r/${room.roomId}#${room.roomSecret}.${room.hostThumb}`),
    ).toEqual(room);
  });

  it('rejects malformed links', () => {
    expect(parseLink('https://x.example/r/short')).toBeNull();
    expect(parseLink(`${APP}/r/1H5fVwX9kQ#bad`)).toBeNull();
    expect(parseLink(`${APP}/r/1H5fVwX9kQ`)).toBeNull();
    expect(parseLink('not a url at all ///')).toBeNull();
  });

  it('detects an incomplete link (missing fragment)', () => {
    const id = randomRoomId();
    expect(isIncompleteLink(`/r/${id}`, '')).toBe(true);
    expect(isIncompleteLink(`/r/${id}`, '#abc')).toBe(true);
    expect(
      isIncompleteLink(`/r/${id}`, `#${randomSecret()}.${randomSecret()}`),
    ).toBe(false);
    expect(isIncompleteLink('/about', '')).toBe(false);
  });
});
