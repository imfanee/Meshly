import { expect, test } from '@playwright/test';

test('home renders brand, start card and footer credit', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Meshly/);
  await expect(
    page.getByRole('heading', { name: 'Private meetings, peer to peer.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start a meeting' }),
  ).toBeVisible();
  await expect(page.getByText('Architected by Faisal Hanif')).toBeVisible();
  await expect(page.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
    'href',
    /faisal-hanif-ai-telecom/,
  );
});

test('content routes render', async ({ page }) => {
  for (const path of ['/about', '/privacy', '/terms']) {
    await page.goto(path);
    await expect(
      page.getByText('Architected by Faisal Hanif').first(),
    ).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();
});

test('unknown route shows not-found', async ({ page }) => {
  await page.goto('/nope');
  await expect(
    page.getByRole('heading', { name: 'Page not found.' }),
  ).toBeVisible();
});

test('room link without fragment shows the incomplete-link message', async ({
  page,
}) => {
  await page.goto('/r/1H5fVwX9kQ');
  await expect(page.getByText(/meeting link is incomplete/)).toBeVisible();
});

test('full room link renders pre-join at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const secret = 'AAAAAAAAAAAAAAAAAAAAAA';
  const thumb = 'BBBBBBBBBBBBBBBBBBBBBB';
  await page.goto(`/r/1H5fVwX9kQ#${secret}.${thumb}`);
  await expect(
    page.getByRole('button', { name: /Microphone on/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask to join' })).toBeVisible();
});

test('keyboard focus is visible on the start button', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Test User');
  const start = page.getByRole('button', { name: 'Start a meeting' });
  await start.focus();
  await expect(start).toBeFocused();
});

test('offline reload still shows the app shell', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.ready);
  await page.reload(); // first navigation under SW control
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Private meetings, peer to peer.' }),
  ).toBeVisible();
  await context.setOffline(false);
});
