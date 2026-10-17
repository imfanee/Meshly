import { expect, test } from '@playwright/test';

/**
 * T1.4 acceptance: two tabs exchange a signed, encrypted message over the
 * dev-relay transport. The harness (?e2e=1) exposes core modules on
 * window.__meshlyTest.
 */

const RELAY = 'ws://localhost:8787';

interface MeshlyTest {
  deriveRoomKeys(secret: string, roomId: string): Promise<{ topic: string }>;
  generateIdentity(): Promise<unknown>;
  DevRelayTransport: new (url: string) => unknown;
  SignallingHub: new (
    transports: unknown[],
    keys: unknown,
    identity: unknown,
    hostThumb: string,
    events: { onMessage(e: unknown): void },
  ) => Hub;
}

interface Hub {
  peerId: string;
  connect(t: string): Promise<void>;
  send(t: string, b: unknown, to: string, pk: boolean): Promise<void>;
}

declare global {
  interface Window {
    __meshlyTest?: MeshlyTest;
    __hub?: Hub;
    __received?: { from: string; t: string; b: unknown }[];
  }
}

async function openTab(context: import('@playwright/test').BrowserContext) {
  const page = await context.newPage();
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__meshlyTest);
  return page;
}

async function bootHub(
  page: import('@playwright/test').Page,
  secret: string,
  roomId: string,
) {
  await page.evaluate(
    async ([secret, roomId, relay]) => {
      const m = window.__meshlyTest as MeshlyTest;
      const keys = await m.deriveRoomKeys(secret, roomId);
      const identity = await m.generateIdentity();
      window.__received = [];
      const hub = new m.SignallingHub(
        [new m.DevRelayTransport(relay)],
        keys,
        identity,
        'unused-thumb',
        {
          onMessage: (e) =>
            window.__received?.push(
              e as { from: string; t: string; b: unknown },
            ),
        },
      );
      await hub.connect((keys as { topic: string }).topic);
      window.__hub = hub;
    },
    [secret, roomId, RELAY],
  );
}

test('two tabs exchange a signed encrypted message via dev relay', async ({
  context,
}) => {
  const secret = 'aGVsbG8td29ybGQtc2VjcmV0IQ'; // base64url test key material
  const roomId = 'VwXmKn4pQr';
  const a = await openTab(context);
  const b = await openTab(context);
  await bootHub(a, secret, roomId);
  await bootHub(b, secret, roomId);

  await a.evaluate(() =>
    window.__hub?.send('hello', { note: 'hi from A' }, '*', true),
  );

  await expect
    .poll(() => b.evaluate(() => window.__received ?? []), { timeout: 10_000 })
    .toEqual([
      expect.objectContaining({ t: 'hello', b: { note: 'hi from A' } }),
    ]);
});
