import { expect, test, type Browser } from '@playwright/test';

/** T3.3: recording notice — every participant sees the banner within 1 s. */

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

test('guest sees the recording banner within a second', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host N');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest N');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest N' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(4000); // ctl channels open

  await h.page.evaluate(() =>
    window.__meshlyTest!.startRecording({ preferOpfs: true }),
  );
  // The media broadcast carries the flag; banner must appear fast.
  await expect(
    g.locator('[role=status]', { hasText: 'Recording' }),
  ).toBeVisible({ timeout: 1000 });
  await expect(
    h.page.locator('[role=status]', { hasText: 'Recording' }),
  ).toBeVisible();

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
