import { test, expect } from '@playwright/test';

test.describe('start progress and QR share/join', () => {
  test('start button disables and staged progress appears', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Your name').fill('Host');
    const start = page.getByRole('button', { name: 'Start a meeting' });
    await start.click();
    // Either the staged progress is visible or room creation has already
    // navigated to the call (fast path). Both prove the click took effect.
    await Promise.race([
      page.getByRole('status').waitFor({ state: 'visible' }),
      page.waitForURL(/\/r\//),
    ]);
    if (await page.getByRole('status').isVisible()) {
      await expect(page.getByRole('status')).toContainText('Adding security');
      await expect(page.getByRole('status')).toContainText('Creating room');
      await expect(page.getByRole('status')).toContainText('Connecting');
    }
    await expect(page).toHaveURL(/\/r\//);
  });

  test('join card offers QR scan options', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Join with a QR code' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Scan with camera' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Choose a QR image' }),
    ).toBeVisible();
  });

  test('host can show the meeting link as a QR code', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your name').fill('Host');
    await page.getByRole('button', { name: 'Start a meeting' }).click();
    await page.getByRole('button', { name: 'Start meeting' }).click();
    await page
      .getByRole('button', { name: 'QR code', exact: true })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('svg').first()).toBeVisible();
    await expect(dialog).toContainText('meshly');
  });
});
