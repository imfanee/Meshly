import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * T1.5 acceptance: create/join, deny, lock and capacity over the dev relay.
 * The preview build is started with VITE_DEV_RELAY_URL (see playwright.config)
 * so signalling stays hermetic. VITE_MAX_PARTICIPANTS=2 lets a three-tab test
 * reach "full". Each participant gets their own browser context because the
 * host key lives in IndexedDB (a shared context would leak host status).
 */

async function startMeeting(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Start a meeting' }).click();
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  return { ctx, page };
}

async function askToJoin(browser: Browser, url: string, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
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
}

test('guest asks to join and the host admits them', async ({ browser }) => {
  const host = await startMeeting(browser, 'Host One');
  const guest = await askToJoin(browser, host.page.url(), 'Guest One');
  await admit(host.page, 'Guest One');
  await expect(guest.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(host.page.getByText('2 people')).toBeVisible();
  await host.ctx.close();
  await guest.ctx.close();
});

test('host deny leaves the guest in the lobby with a denied message', async ({
  browser,
}) => {
  const host = await startMeeting(browser, 'Host Two');
  const guest = await askToJoin(browser, host.page.url(), 'Guest Two');
  await host.page.getByRole('button', { name: 'People', exact: true }).click();
  const row = host.page.locator('li', { hasText: 'Guest Two' });
  await row.getByRole('button', { name: 'Deny' }).click();
  await expect(guest.page.getByText('The host did not let you in')).toBeVisible(
    { timeout: 15_000 },
  );
  await host.ctx.close();
  await guest.ctx.close();
});

test('locked room denies new knockers', async ({ browser }) => {
  const host = await startMeeting(browser, 'Host Three');
  const guest = await askToJoin(browser, host.page.url(), 'Guest Three');
  await host.page.getByRole('button', { name: 'People', exact: true }).click();
  await host.page.getByRole('button', { name: 'Lock meeting' }).click();
  await expect(guest.page.getByText('This meeting is locked.')).toBeVisible({
    timeout: 15_000,
  });
  await host.ctx.close();
  await guest.ctx.close();
});

test('capacity: third joiner sees the room is full', async ({ browser }) => {
  // Build is configured with VITE_MAX_PARTICIPANTS=2.
  const host = await startMeeting(browser, 'Host Four');
  const url = host.page.url();
  const g1 = await askToJoin(browser, url, 'Guest A');
  await admit(host.page, 'Guest A');
  await expect(g1.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  const g2ctx = await browser.newContext();
  const g2 = await g2ctx.newPage();
  await g2.goto(url);
  await g2.getByLabel('Your name').fill('Guest B');
  await g2.getByRole('button', { name: 'Ask to join' }).click();
  await expect(g2.getByText('This meeting is full (2 people).')).toBeVisible({
    timeout: 15_000,
  });
  await host.ctx.close();
  await g1.ctx.close();
  await g2ctx.close();
});
