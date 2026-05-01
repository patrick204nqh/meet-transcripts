import { test, expect } from './fixtures/extension.js';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
    await page.evaluate(() => new Promise(resolve =>
      chrome.storage.sync.set({
        autoPostWebhookAfterMeeting: true,
        autoDownloadFileAfterMeeting: true,
        webhookBodyType: 'simple',
        operationMode: 'auto',
      }, resolve)
    ));
    await page.reload();
  });

  test('renders expected page structure', async ({ page }) => {
    await expect(page.locator('button.tab-btn.active')).toHaveText(/Settings/);
    await expect(page.locator('#auto-mode')).toBeVisible();
    await expect(page.locator('#manual-mode')).toBeVisible();
    await expect(page.locator('#auto-download-file')).toBeVisible();
    await expect(page.locator('#auto-post-webhook')).toBeVisible();
    await expect(page.locator('#webhook-url')).toBeVisible();
    await expect(page.locator('#save-webhook')).toBeVisible();
    await expect(page.locator('#simple-webhook-body')).toBeVisible();
    await expect(page.locator('#advanced-webhook-body')).toBeVisible();
    await expect(page.locator('button[data-view="meetings"]')).toBeVisible();
  });

  test('automation defaults — auto-download and auto-post checked, simple body selected', async ({ page }) => {
    await expect(page.locator('#auto-download-file')).toBeChecked();
    await expect(page.locator('#auto-post-webhook')).toBeChecked();
    await expect(page.locator('#simple-webhook-body')).toBeChecked();
    await expect(page.locator('#advanced-webhook-body')).not.toBeChecked();
  });

  test('auto mode is selected by default', async ({ page }) => {
    await expect(page.locator('#auto-mode')).toBeChecked();
    await expect(page.locator('#manual-mode')).not.toBeChecked();
  });

  test('switching to manual mode persists across reload', async ({ page }) => {
    await page.locator('#manual-mode').check();
    await page.reload();
    await expect(page.locator('#manual-mode')).toBeChecked();
  });

  test('can switch between Simple and Advanced webhook body', async ({ page }) => {
    await page.locator('#advanced-webhook-body').check();
    await expect(page.locator('#advanced-webhook-body')).toBeChecked();
    await expect(page.locator('#simple-webhook-body')).not.toBeChecked();

    await page.locator('#simple-webhook-body').check();
    await expect(page.locator('#simple-webhook-body')).toBeChecked();
    await expect(page.locator('#advanced-webhook-body')).not.toBeChecked();
  });

  test('webhook URL persists after save and page reload', async ({ page }) => {
    const url = 'https://hooks.example.com/my-webhook';
    await page.evaluate(() => {
      chrome.permissions.request = async () => true;
    });
    await page.locator('#webhook-url').fill(url);
    await page.locator('#save-webhook').click();
    await page.reload();
    await expect(page.locator('#webhook-url')).toHaveValue(url);
  });

  test('webhook body type selection persists across reload', async ({ page }) => {
    await page.locator('#advanced-webhook-body').check();
    await page.reload();
    await expect(page.locator('#advanced-webhook-body')).toBeChecked();
  });
});
