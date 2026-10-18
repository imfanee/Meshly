import { expect, test, type Browser } from '@playwright/test';

/** T3.1: compositor runs at ~25 fps and emits composite video + mixed
 * audio tracks. */

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

test('compositor ticks ~25 fps and emits video+audio', async ({ browser }) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host C');
  // Sample frame count over ~3 s: worker ticker should tick ~25 fps.
  const fps = await h.page.evaluate(async () => {
    const c = await window.__meshlyTest!.startComposite();
    const out = c.getStream();
    const tracks = out
      .getTracks()
      .map((t) => t.kind)
      .join(',');
    const f0 = c.frameCount;
    await new Promise((r) => setTimeout(r, 3000));
    const rate = ((c.frameCount - f0) / 3).toFixed(0);
    window.__meshlyTest!.stopComposite();
    return `${rate}:${tracks}`;
  });
  const [rate, tracks] = fps.split(':');
  expect(Number(rate)).toBeGreaterThanOrEqual(20);
  expect(Number(rate)).toBeLessThanOrEqual(30);
  expect(tracks).toContain('video');
  expect(tracks).toContain('audio');
  await Promise.allSettled([h.ctx.close()]);
});
