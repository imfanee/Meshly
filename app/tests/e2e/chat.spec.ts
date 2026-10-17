import { expect, test, type Browser } from '@playwright/test';

/**
 * T1.8 acceptance: chat over the ctl data channel, dedupe by message id.
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

async function guest(browser: Browser, url: string, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url.replace('#', '?e2e=1#'));
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  return { ctx, page };
}

test('chat messages arrive over ctl and dedupe by id', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host C');
  const g = await guest(browser, h.page.url(), 'Guest C');
  // Admit via People panel
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest C' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  // Wait for the ctl channel to open.
  await g.page.waitForTimeout(4000);

  // Guest sends a chat via the UI.
  await g.page.getByRole('button', { name: 'Chat' }).click();
  await g.page.getByRole('textbox', { name: 'Message' }).fill('hello meshly');
  await g.page.getByRole('button', { name: 'Send' }).click();

  // Host sees it once.
  await expect
    .poll(
      () =>
        h.page.evaluate(() =>
          window.__meshlyTest!.session.chat.map((m) => m.text),
        ),
      { timeout: 15_000 },
    )
    .toContain('hello meshly');

  // Dedupe: inject the same message id twice; only one lands.
  const hostPeerId = await h.page.evaluate(
    () => window.__meshlyTest!.session.peers[0]?.peerId,
  );
  const before = await h.page.evaluate(
    () => window.__meshlyTest!.session.chat.length,
  );
  await h.page.evaluate(
    ([pid]) => {
      const msg = {
        t: 'chat',
        id: 'dedupe-test-id',
        ts: Date.now(),
        b: { text: 'duplicated' },
      };
      window.__meshlyTest!.debugInjectCtl(pid, msg);
      window.__meshlyTest!.debugInjectCtl(pid, msg);
    },
    [hostPeerId],
  );
  await h.page.waitForTimeout(500);
  const after = await h.page.evaluate(
    () => window.__meshlyTest!.session.chat.length,
  );
  expect(after).toBe(before + 1);
  await Promise.allSettled([h.ctx.close(), g.ctx.close()]);
});
