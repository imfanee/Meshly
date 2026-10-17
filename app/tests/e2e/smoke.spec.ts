import { expect, test } from '@playwright/test';

test('app shell loads and shows the Meshly brand', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Meshly/);
  await expect(
    page.getByRole('heading', { name: 'Meshly', level: 1 }),
  ).toBeVisible();
});
