import { test, expect } from './fixtures/extension.js';

test.describe('Popup', () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
  });

  test('renders the extension title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('meet-transcripts');
  });

  test('shows platform toggles for Google Meet, Teams, and Zoom', async ({ page }) => {
    await expect(page.locator('#enable-google-meet')).toBeVisible();
    await expect(page.locator('label[for="enable-google-meet"]')).toContainText('Google Meet');

    await expect(page.locator('#enable-teams')).toBeVisible();
    await expect(page.locator('label[for="enable-teams"]')).toContainText('Teams');

    await expect(page.locator('#enable-zoom')).toBeVisible();
    await expect(page.locator('label[for="enable-zoom"]')).toContainText('Zoom');
  });

  test('shows Auto mode and Manual mode radio buttons', async ({ page }) => {
    await expect(page.locator('#auto-mode')).toBeVisible();
    await expect(page.locator('label[for="auto-mode"]')).toContainText('Auto mode');

    await expect(page.locator('#manual-mode')).toBeVisible();
    await expect(page.locator('label[for="manual-mode"]')).toContainText('Manual mode');
  });

  test('Google Meet is enabled by default (mandatory host permission)', async ({ page }) => {
    // Google Meet is listed in host_permissions (mandatory), so its content script
    // is registered on install and the toggle reflects "Enabled" on first load.
    await expect(page.locator('#enable-google-meet')).toBeChecked();
  });

  test('Teams and Zoom are disabled by default (optional permissions)', async ({ page }) => {
    // Teams and Zoom use optional_host_permissions — not granted until the user enables them.
    await expect(page.locator('#enable-teams')).not.toBeChecked();
    await expect(page.locator('#enable-zoom')).not.toBeChecked();
  });

  test('can toggle Google Meet platform on and off', async ({ page }) => {
    const checkbox = page.locator('#enable-google-meet');
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test('shows link to meetings page', async ({ page }) => {
    await expect(page.locator('a[href="./meetings.html"]')).toBeVisible();
  });

  test('auto-download is enabled by default', async ({ page }) => {
    await expect(page.locator('#auto-download-file')).toBeChecked();
  });

  test('switching to manual mode unchecks auto mode', async ({ page }) => {
    await page.locator('#manual-mode').check();
    await expect(page.locator('#manual-mode')).toBeChecked();
    await expect(page.locator('#auto-mode')).not.toBeChecked();
  });
});
