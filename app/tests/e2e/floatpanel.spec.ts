import { test, expect } from '@playwright/test';

/** Mobile UX: panels float over the call instead of covering it. */
test('mobile: chat panel floats and keeps controls visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Your name').fill('Host');
  await page.getByRole('button', { name: 'Start a meeting' }).click();
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Chat' });
  await expect(panel).toBeVisible();
  // Video area and the control bar must remain reachable behind it.
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();
  // The panel must not span the full screen.
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeLessThan(390);
  expect(box.height).toBeLessThan(844);
});
