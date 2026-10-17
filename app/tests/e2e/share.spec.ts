import { expect, test, type Browser } from '@playwright/test';

/**
 * T2.1 acceptance: screen sharing over the extra transceiver, host gate,
 * screen layout at the receiver. Fake-media Chromium auto-accepts
 * getDisplayMedia via --use-fake-ui-for-media-stream.
 */

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

test('host shares screen; guest sees the share tile and stops cleanly', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host S');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest S');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  await h.page.getByRole('button', { name: 'People', exact: true }).click();
  await h.page
    .locator('li', { hasText: 'Guest S' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  await g.waitForTimeout(4000); // ctl channel open

  await h.page.getByRole('button', { name: 'Share screen' }).click();
  await expect(
    h.page.getByRole('main').getByText('You are sharing your screen'),
  ).toBeVisible({ timeout: 15_000 });

  // Guest side: the share flag arrives via the media ctl message, the mid
  // via `tracks`, then the layout shows "Host S is sharing".
  await expect(g.getByText('Host S is sharing')).toBeVisible({
    timeout: 20_000,
  });

  await h.page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(
    h.page.getByRole('main').getByText('You are sharing your screen'),
  ).toBeHidden({ timeout: 10_000 });
  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
