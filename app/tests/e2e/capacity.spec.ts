import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Capacity limit, T1.5/T1.6. The preview build runs with
 * VITE_MAX_PARTICIPANTS=3 so a four-context test reaches "full". Tracing is
 * off for this file: four live WebRTC contexts corrupt the trace zip on
 * teardown and dwarf the room logic under test.
 */
test.use({ trace: 'off' });

async function startMeeting(browser: Browser, name: string) {
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

test('fourth joiner sees the room is full', async ({ browser }) => {
  test.setTimeout(150_000); // three joins plus full-mesh media
  const host = await startMeeting(browser, 'Host Four');
  const url = host.page.url();
  const g1 = await askToJoin(browser, url, 'Guest A');
  await admit(host.page, 'Guest A');
  await expect(g1.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  const g2 = await askToJoin(browser, url, 'Guest B');
  await admit(host.page, 'Guest B');
  await expect(g2.page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });
  const g3ctx = await browser.newContext();
  const g3 = await g3ctx.newPage();
  await g3.goto(url.replace('#', '?e2e=1#'));
  await g3.getByLabel('Your name').fill('Guest C');
  await g3.getByRole('button', { name: 'Ask to join' }).click();
  try {
    await expect(g3.getByText('This meeting is full (3 people).')).toBeVisible({
    // The host is busy negotiating WebRTC for A and B; deny can lag.
    timeout: 30_000,
  });
  } finally {
    for (const [tag, p] of [
      ['HOST', host.page],
      ['G3', g3],
    ] as const) {
      const diag = await p.evaluate(() => {
        const m = (
          window as unknown as {
            __meshlyTest: {
              session: { lobbyState: string; drops: string[]; knocks: { name: string }[] };
            };
          }
        ).__meshlyTest;
        return {
          lobby: m.session.lobbyState,
          knocks: m.session.knocks.map((k) => k.name),
          drops: m.session.drops.slice(-8),
        };
      });
      console.log(`${tag}-DIAG:`, JSON.stringify(diag));
    }
  }
  await Promise.allSettled(
    [host.ctx, g1.ctx, g2.ctx, g3ctx].map((c) => c.close()),
  );
});
