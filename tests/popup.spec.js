import { test, expect } from './fixtures/extension.js';

test.describe('Popup', () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
  });

  test('renders the extension title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('meet-transcripts');
  });

  test('shows Active on Google Meet status', async ({ page }) => {
    await expect(page.getByText('Active on Google Meet')).toBeVisible();
  });

  test('does not show Teams or Zoom platform toggles', async ({ page }) => {
    await expect(page.locator('#enable-teams')).toHaveCount(0);
    await expect(page.locator('#enable-zoom')).toHaveCount(0);
  });

  test('shows Auto mode radio button', async ({ page }) => {
    await expect(page.locator('#auto-mode')).toBeVisible();
    await expect(page.locator('label[for="auto-mode"]')).toContainText('Auto mode');
  });

  test('shows Manual mode radio button', async ({ page }) => {
    await expect(page.locator('#manual-mode')).toBeVisible();
    await expect(page.locator('label[for="manual-mode"]')).toContainText('Manual mode');
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

  test('shows link to meetings page', async ({ page }) => {
    await expect(page.locator('a[href="./meetings.html"]')).toBeVisible();
  });

  test('shows link to webhook configuration', async ({ page }) => {
    await expect(page.locator('a[href="meetings.html#webhooks"]')).toBeVisible();
  });
});
