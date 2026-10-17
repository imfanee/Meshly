import { describe, expect, it } from 'vitest';
import { config } from '../../src/config';

describe('scaffold environment', () => {
  it('provides WebCrypto, which core/crypto depends on', () => {
    expect(globalThis.crypto?.subtle).toBeDefined();
    expect(globalThis.crypto?.getRandomValues).toBeTypeOf('function');
  });

  it('parses public config with safe fallbacks', () => {
    expect(config.maxParticipants).toBeGreaterThan(0);
    expect(config.maxVideo).toBeGreaterThan(0);
    expect(config.iceEscalateMs).toBeGreaterThan(0);
    expect(Array.isArray(config.stunUrls)).toBe(true);
    expect(config.turnCredentialsPath.startsWith('/')).toBe(true);
  });
});
