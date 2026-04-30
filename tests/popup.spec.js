import { test, expect } from './fixtures/extension.js';

test.describe('Popup', () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
  });

  test('renders expected page structure', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Meet Transcripts');
    await expect(page.getByText('Active on Google Meet')).toBeVisible();
    await expect(page.locator('#auto-mode')).toBeVisible();
    await expect(page.locator('#manual-mode')).toBeVisible();
    await expect(page.locator('a[href="./meetings.html"]')).toBeVisible();
    await expect(page.locator('a[href="meetings.html#webhooks"]')).toBeVisible();
    await expect(page.locator('#enable-teams')).toHaveCount(0);
    await expect(page.locator('#enable-zoom')).toHaveCount(0);
  });

  test('auto mode is selected by default', async ({ page }) => {
    await expect(page.locator('#auto-mode')).toBeChecked();
    await expect(page.locator('#manual-mode')).not.toBeChecked();
  });

  test('switching to manual mode unchecks auto mode', async ({ page }) => {
    await page.locator('#manual-mode').check();
    await expect(page.locator('#manual-mode')).toBeChecked();
    await expect(page.locator('#auto-mode')).not.toBeChecked();
  });

  test('operation mode selection persists across page reload', async ({ page }) => {
    await page.locator('#manual-mode').check();
    await page.reload();
    await expect(page.locator('#manual-mode')).toBeChecked();
    await expect(page.locator('#auto-mode')).not.toBeChecked();
  });
});
