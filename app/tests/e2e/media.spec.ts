import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * T1.6 acceptance: a three-way call with video playing at all ends, and a
 * device switch that does not drop the call. Fake media devices in Chromium
 * produce a test pattern, so "playing" = video element has frames.
 */

async function host(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('HOST-ERR:', m.text().slice(0, 300));
  });
  page.on('pageerror', (e) =>
    console.log('HOST-PAGEERR:', e.message.slice(0, 300)),
  );
  await page.goto('/?e2e=1');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Start a meeting' }).click();
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  return { ctx, page };
}

async function guest(browser: Browser, url: string, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('GUEST-ERR:', m.text().slice(0, 300));
  });
  page.on('pageerror', (e) =>
    console.log('GUEST-PAGEERR:', e.message.slice(0, 300)),
  );
  // ?e2e=1 exposes the test harness; keep the room fragment intact.
  await page.goto(url.replace('#', '?e2e=1#'));
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(
    page.getByText('Waiting for the host to let you in'),
  ).toBeVisible({ timeout: 15_000 });
  return { ctx, page };
}

async function admit(host: Page, name: string) {
  await host.getByRole('button', { name: 'People', exact: true }).click();
  const row = host.locator('li', { hasText: name });
  await row.getByRole('button', { name: 'Admit' }).click();
  await host.getByLabel('Close panel').click();
}

const playingVideos = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('video')].filter(
        (v) => v.readyState >= 2 && !v.paused,
      ).length,
  );

const videoDiag = (page: Page) =>
  page.evaluate(() => {
    const m = (
      window as unknown as {
        __meshlyTest: {
          session: { peers: unknown[]; drops: string[] };
          debugPeers(): unknown;
        };
      }
    ).__meshlyTest;
    return {
      peers: m.debugPeers?.(),
      drops: m.session?.drops,
      vids: [...document.querySelectorAll('video')].map((v) => ({
        rs: v.readyState,
        paused: v.paused,
        tracks:
          v.srcObject instanceof MediaStream
            ? v.srcObject.getTracks().length
            : -1,
      })),
    };
  });

const closeAll = async (...ctxs: { close(): Promise<void> }[]) => {
  await Promise.allSettled(ctxs.map((c) => c.close()));
};

test('three-way call: video playing at all ends', async ({ browser }) => {
  test.setTimeout(120_000); // two admissions plus full-mesh negotiation
  const h = await host(browser, 'Host M');
  const url = h.page.url();
  const g1 = await guest(browser, url, 'Guest M1');
  await admit(h.page, 'Guest M1');
  await expect(g1.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  const g2 = await guest(browser, url, 'Guest M2');
  await admit(h.page, 'Guest M2');
  await expect(g2.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });

  // Each page should have 3 playing videos (local + 2 remote).
  await Promise.all(
    [h.page, g1.page, g2.page].map((p) =>
      expect.poll(() => playingVideos(p), { timeout: 30_000 }).toBe(3),
    ),
  );
  await closeAll(h.ctx, g1.ctx, g2.ctx);
});

test('device switch does not drop the call', async ({ browser }) => {
  const h = await host(browser, 'Host D');
  const g = await guest(browser, h.page.url(), 'Guest D');
  await admit(h.page, 'Guest D');
  await expect(g.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  await g.page.waitForTimeout(6000);
  console.log('HOST-DIAG:', JSON.stringify(await videoDiag(h.page)));
  console.log('GUEST-DIAG:', JSON.stringify(await videoDiag(g.page)));
  await expect.poll(() => playingVideos(g.page), { timeout: 20_000 }).toBe(2);

  // Switch the guest's mic to another (fake) device via the harness.
  const switched = await g.page.evaluate(async () => {
    const m = (
      window as unknown as {
        __meshlyTest: {
          localMedia: {
            listDevices(): Promise<MediaDeviceInfo[]>;
            switchAudioDevice(id: string): Promise<void>;
          };
        };
      }
    ).__meshlyTest;
    const devices = await m.localMedia.listDevices();
    const audio = devices.find((d) => d.kind === 'audioinput');
    if (!audio) return 'no-device';
    await m.localMedia.switchAudioDevice(audio.deviceId);
    return 'ok';
  });
  expect(switched).toBe('ok');
  // The call stays up: still 2 playing videos afterwards.
  await g.page.waitForTimeout(1500);
  expect(await playingVideos(g.page)).toBe(2);
  await closeAll(h.ctx, g.ctx);
});
