import { expect, test, type Browser } from '@playwright/test';

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

test('cam toggle: remote audio survives off; local view returns on', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const h = await host(browser, 'Host B');
  const gctx = await browser.newContext();
  const g = await gctx.newPage();
  await g.goto(h.page.url().replace('#', '?e2e=1#'));
  await g.getByLabel('Your name').fill('Guest B');
  await g.getByRole('button', { name: 'Ask to join' }).click();
  if (!(await h.page.getByLabel('Close panel').isVisible())) {
    await h.page.getByRole('button', { name: 'People', exact: true }).click();
  }
  await h.page
    .locator('li', { hasText: 'Guest B' })
    .getByRole('button', { name: 'Admit' })
    .click();
  await expect(g.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 20_000,
  });
  await g.waitForTimeout(4000);

  // Host turns cam off: remote flag flips, but the remote <video> element
  // must STAY mounted (with its audio track) so audio keeps playing.
  await h.page.getByLabel('Camera on', { exact: true }).click();
  await expect
    .poll(
      () =>
        g.evaluate(
          () =>
            (
              window.__meshlyTest!.session.peers[0] as
                { camOn?: boolean } | undefined
            )?.camOn,
        ),
      { timeout: 10_000 },
    )
    .toBe(false);
  const vids = await g.evaluate(() =>
    [...document.querySelectorAll<HTMLVideoElement>('video:not([muted])')].map(
      (v) => ({
        audio:
          (v.srcObject as MediaStream | null)?.getAudioTracks().length ?? -1,
      }),
    ),
  );
  expect(vids.some((v) => v.audio > 0)).toBe(true); // audio element survived

  // Host turns cam on again: the local self-view must have frames.
  await h.page.getByLabel('Camera off', { exact: true }).click();
  await h.page.waitForTimeout(3000);
  console.log(
    'DEBUG vids:',
    await h.page.evaluate(() =>
      [...document.querySelectorAll('video')].map((v) => ({
        muted: v.muted,
        w: v.videoWidth,
        tracks:
          (v.srcObject as MediaStream | null)?.getVideoTracks().length ?? -1,
      })),
    ),
  );

  await expect
    .poll(
      async () =>
        h.page.evaluate(() => {
          const v = document.querySelector(
            'video[muted]',
          ) as HTMLVideoElement | null;
          return v?.videoWidth ?? 0;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  await Promise.allSettled([h.ctx.close(), gctx.close()]);
});
