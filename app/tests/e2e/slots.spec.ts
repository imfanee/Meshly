import { expect, test, type Browser } from '@playwright/test';

/** T2.3: host revokes a guest's camera slot via slot-revoke. */

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

test('host revokes a guest camera slot', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host V');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest V');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest V' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(5000); // ctl open + media state exchanged

  // Guest's camera is on (fake media); the host's view shows camOn.
  const guestOnHost = () =>
    h.page.evaluate(
      () =>
        window.__meshlyTest!.session.peers.find((p) => p.name === 'Guest V')
          ?.camOn,
    );
  await expect.poll(guestOnHost, { timeout: 10_000 }).toBe(true);

  // Host revokes the slot; the guest's media broadcast flips camOn off.
  await h.page
    .locator('li', { hasText: 'Guest V' })
    .getByRole('button', { name: 'Camera off' })
    .click();
  await expect.poll(guestOnHost, { timeout: 15_000 }).toBe(false);

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
