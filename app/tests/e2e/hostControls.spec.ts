import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * T2.2 acceptance: host can remove a guest, end for everyone, and resume
 * the host role after a page reload (host key persisted in IndexedDB).
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

async function admit(browser: Browser, h: Page, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(h.url().replace('#', '?e2e=1#'));
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  const close = h.getByLabel('Close panel');
  if (!(await close.isVisible())) {
    await h.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h
    .locator('li', { hasText: name })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  return { ctx, page };
}

test('host removes a guest', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host R');
  const g = await admit(browser, h.page, 'Guest R');
  await h.page
    .locator('li', { hasText: 'Guest R' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(
    g.page.getByText('You were removed from the meeting.'),
  ).toBeVisible({ timeout: 10_000 });
  await Promise.allSettled([h.ctx.close(), g.ctx.close()]);
});

test('end for everyone sends guests to the ended screen', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host E');
  const g = await admit(browser, h.page, 'Guest E');
  await h.page.getByRole('button', { name: 'Leave' }).click();
  await h.page.getByRole('menuitem', { name: 'End for everyone' }).click();
  await expect(g.page.getByText('The host ended the meeting.')).toBeVisible({
    timeout: 10_000,
  });
  await Promise.allSettled([h.ctx.close(), g.ctx.close()]);
});

test('host reload resumes as host', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host H');
  await h.page.reload();
  // The host key in IndexedDB restores the host role: no knock needed.
  await expect(
    h.page.getByRole('button', { name: 'Start meeting' }),
  ).toBeVisible({ timeout: 15_000 });
  await h.page.getByRole('button', { name: 'Start meeting' }).click();
  await expect(h.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  // And guests can still knock on the resumed room.
  const g = await admit(browser, h.page, 'Guest H');
  await Promise.allSettled([h.ctx.close(), g.ctx.close()]);
});
