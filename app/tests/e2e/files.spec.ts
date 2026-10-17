import { expect, test, type Browser } from '@playwright/test';

/** T2.6: 50 MB file transfers peer-to-peer and the SHA-256 verifies. */

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

test('50 MB file transfers with matching SHA-256', async ({ browser }) => {
  test.setTimeout(300_000);
  const h = await host(browser, 'Host F');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest F');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest F' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(5000); // ctl channels open

  // Host sends a deterministic 50 MB file (crypto-free pattern).
  const expected = await h.page.evaluate(async () => {
    const size = 50 * 1024 * 1024;
    const buf = new Uint8Array(size);
    for (let i = 0; i < size; i++) buf[i] = (i * 31) & 0xff;
    const file = new File([buf], 'big.bin', {
      type: 'application/octet-stream',
    });
    const hash = await crypto.subtle.digest(
      'SHA-256',
      await file.arrayBuffer(),
    );
    const hex = [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    (
      window as unknown as {
        __meshlyTest: { sendFile(f: File): Promise<void> };
      }
    ).__meshlyTest.sendFile(file);
    return hex;
  });

  // Guest accepts the offer card.
  await g.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(g.getByRole('button', { name: 'Accept' })).toBeVisible({
    timeout: 15_000,
  });
  await g.getByRole('button', { name: 'Accept' }).click();

  // Wait for done, then hash the raw (unproxied) received blob.
  await expect
    .poll(
      () =>
        g.evaluate(
          () =>
            window.__meshlyTest!.session.files.find((x) => x.state === 'done')
              ?.id ?? null,
        ),
      { timeout: 120_000 },
    )
    .not.toBeNull();
  const got = await g.evaluate(async () => {
    const s = window.__meshlyTest!;
    const f = s.session.files.find((x) => x.state === 'done');
    if (!f) return null;
    const blob = s.fileBlobOf(f.id);
    if (!blob) return null;
    const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(h)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
  expect(got).toBe(expected);

  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
