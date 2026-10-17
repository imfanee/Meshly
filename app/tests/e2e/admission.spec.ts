import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * T1.5 acceptance: create/join, deny, lock and capacity over the dev relay.
 * The preview build is started with VITE_DEV_RELAY_URL (see playwright.config)
 * so signalling stays hermetic. Each participant gets their own browser
 * context because the host key lives in IndexedDB (a shared context would
 * leak host status). Capacity is covered by capacity.spec.ts.
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
  // The People button toggles the panel; only open it if it is closed.
  if (!(await host.getByLabel('Close panel').isVisible())) {
    await host.getByRole('button', { name: 'People', exact: true }).click();
  }
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
