import { expect, test, type Browser } from '@playwright/test';

/** T4.3: pipeline produces attributed transcript lines from live audio
 * tracks (stub transcriber; real Moonshine/BYOK paths share it). */

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

test('pipeline produces attributed transcript lines', async ({ browser }) => {
  test.setTimeout(120_000);
  const h = await host(browser, 'Host P');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest P');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest P' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(4000);

  // Start notes with a stub transcriber; guest consents so both tracks tap.
  await h.page.evaluate(() =>
    window.__meshlyTest!.startNotes(async () => 'a transcribed segment'),
  );
  await g.getByRole('button', { name: 'Allow' }).click({ timeout: 10_000 });
  await h.page.waitForTimeout(5000);
  const taps = await h.page.evaluate(() => window.__meshlyTest!.debugTaps());
  console.log('PIPELINE TAPS:', taps);

  // Segments are ~20 s; wait for two segment cycles plus transcribe time.
  const lines = await h.page.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      const tr = window.__meshlyTest!.session.transcript;
      const speakers = new Set(tr.map((l) => l.speaker));
      if (tr.length >= 2 && speakers.size >= 2) return tr;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return window.__meshlyTest!.session.transcript;
  });
  expect(lines.length).toBeGreaterThanOrEqual(2);
  const speakers = new Set(lines.map((l) => l.speaker));
  expect(speakers).toContain('You');
  expect(speakers).toContain('Guest P');
  expect(lines.every((l) => l.text === 'a transcribed segment')).toBe(true);

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
