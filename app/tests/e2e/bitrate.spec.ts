import { expect, test, type Browser } from '@playwright/test';

/** T2.4: camera sender encoding follows the doc 04 s.3 table (2 senders:
 * 1500 kbps, scale 1, 30 fps). */

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

test('camera encoding matches the doc-04 policy at two senders', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host B');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest B');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest B' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(6000); // media state exchanged + policy applied

  const enc = await g.evaluate(() => {
    const me = window.__meshlyTest!;
    const pid = me.session.peers[0]?.peerId;
    return pid ? me.debugEncoding(pid) : null;
  });
  expect(enc).not.toBeNull();
  // Two video senders (host + guest) -> 1,500 kbps, scale 1, 30 fps.
  expect(enc!.maxBitrate).toBe(1_500_000);
  expect(enc!.scaleResolutionDownBy).toBe(1);
  expect(enc!.maxFramerate).toBe(30);
  expect(enc!.active).not.toBe(false);

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
