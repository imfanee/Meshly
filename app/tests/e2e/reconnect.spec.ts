import { expect, test, type Browser } from '@playwright/test';

/** T2.5: a forced ICE restart must recover to connected. */

async function host(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/?e2e=1');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Start a meeting' }).click();
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  return { ctx, page };
}

test('ICE restart recovers the peer connection', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host X');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest X');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest X' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });

  const guestPeer = () =>
    g.evaluate(
      () =>
        window.__meshlyTest!.debugPeers()[0] as {
          peerId: string;
          conn: string;
        },
    );
  await expect.poll(() => guestPeer().then((p) => p?.conn)).toBe('connected');

  const pid = (await guestPeer()).peerId;
  await g.evaluate((id) => window.__meshlyTest!.debugRestartIce(id), pid);
  await expect
    .poll(() => guestPeer().then((p) => p?.conn), { timeout: 20_000 })
    .toBe('connected');

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
