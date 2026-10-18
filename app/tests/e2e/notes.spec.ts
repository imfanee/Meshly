import { expect, test, type Browser } from '@playwright/test';

/** T4.2: AI notes consent — decline excludes the track; revoke works mid-meeting. */

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

test('decline then allow then revoke drives the consented set', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host A');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest A');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest A' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(4000);

  // Host starts notes; the guest's consent dialog appears.
  await h.page.evaluate(() => window.__meshlyTest!.startNotes());
  await expect(g.getByRole('button', { name: 'Decline' })).toBeVisible({
    timeout: 10_000,
  });
  await g.getByRole('button', { name: 'Decline' }).click();

  const consented = () =>
    h.page.evaluate(() =>
      (
        window.__meshlyTest as unknown as { consentedPeerIds(): string[] }
      ).consentedPeerIds(),
    );
  await expect.poll(consented, { timeout: 10_000 }).toEqual([]);

  // Allow then revoke mid-meeting.
  await h.page.evaluate(() => window.__meshlyTest!.startNotes());
  await g.getByRole('button', { name: 'Allow' }).click();
  await expect.poll(consented, { timeout: 10_000 }).toHaveLength(1);
  await g.evaluate(() =>
    (
      window.__meshlyTest as unknown as { revokeNotesConsent(): void }
    ).revokeNotesConsent(),
  );
  await expect.poll(consented, { timeout: 10_000 }).toEqual([]);

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});

test('shared notes reach the recipient', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host S');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest S');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest S' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(4000);

  await h.page.evaluate(() => window.__meshlyTest!.shareNotes());
  await expect
    .poll(
      () =>
        g.evaluate(
          () => window.__meshlyTest!.session.sharedNotes?.fromName ?? '',
        ),
      { timeout: 10_000 },
    )
    .toBe('Host S');
  const md = await g.evaluate(
    () => window.__meshlyTest!.session.sharedNotes?.md ?? '',
  );
  expect(md).toContain('# Meshly notes');
  expect(md).toContain('Guest S');

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
