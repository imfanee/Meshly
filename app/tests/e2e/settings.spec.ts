import { expect, test } from '@playwright/test';

/** T2.7: settings persist where specified (theme + name to localStorage). */

test('theme and name persist across a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog').getByLabel('Display name').fill('Persist Me');
  await page.getByRole('dialog').getByLabel('Theme').selectOption('dark');
  await page.keyboard.press('Escape');
  await page.reload();
  const stored = await page.evaluate(() => ({
    name: localStorage.getItem('meshly:name'),
    theme: localStorage.getItem('meshly:theme'),
  }));
  expect(stored).toEqual({ name: 'Persist Me', theme: 'dark' });
  // And the dialog shows the persisted values.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog').getByLabel('Display name')).toHaveValue(
    'Persist Me',
  );
  await expect(page.getByRole('dialog').getByLabel('Theme')).toHaveValue(
    'dark',
  );
});
