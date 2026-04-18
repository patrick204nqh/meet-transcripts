import { test, expect } from './fixtures/extension.js';

const MOCK_MEETINGS = [
  {
    meetingSoftware: 'Google Meet',
    meetingTitle: 'Q2 Product Review',
    meetingStartTimestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    meetingEndTimestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    transcript: [],
    chatMessages: [],
    webhookPostStatus: 'successful',
  },
  {
    meetingSoftware: 'Google Meet',
    meetingTitle: '1:1 with Manager',
    meetingStartTimestamp: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    meetingEndTimestamp: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    transcript: [],
    chatMessages: [],
    webhookPostStatus: 'failed',
  },
  {
    meetingSoftware: 'Google Meet',
    meetingTitle: 'Design Review',
    meetingStartTimestamp: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    meetingEndTimestamp: new Date(Date.now() - 70.5 * 60 * 60 * 1000).toISOString(),
    transcript: [],
    chatMessages: [],
    webhookPostStatus: 'new',
  },
];

async function seedMeetings(page, meetings) {
  await page.evaluate((data) => {
    return new Promise((resolve) => chrome.storage.local.set({ meetings: data }, resolve));
  }, meetings);
  await page.reload();
  await page.waitForSelector('#meetings-table tr');
}

test.describe('Meetings page', () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/meetings.html`);
  });

  test('renders the page title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Meet Transcripts');
  });

  test('shows the Last 10 meetings section', async ({ page }) => {
    await expect(page.locator('#last-10-meetings h2')).toHaveText('Last 10 meetings');
  });

  test('shows the meetings table with correct column headers', async ({ page }) => {
    const headers = page.locator('table thead th');
    await expect(headers.nth(0)).toHaveText('Meeting title');
    await expect(headers.nth(1)).toHaveText('Meeting software');
    await expect(headers.nth(2)).toHaveText('Meeting start time and duration');
    await expect(headers.nth(3)).toHaveText('Webhook status');
  });

  test('shows the Recover last meeting button', async ({ page }) => {
    await expect(page.locator('#recover-last-meeting')).toBeVisible();
  });

  test('shows the webhooks section heading', async ({ page }) => {
    await expect(page.locator('#webhooks h2')).toHaveText('Webhooks');
  });

  test('shows the webhook configuration form', async ({ page }) => {
    await expect(page.locator('#webhooks')).toBeVisible();
    await expect(page.locator('#webhook-url')).toBeVisible();
    await expect(page.locator('#save-webhook')).toBeVisible();
  });

  test('auto-post webhook checkbox is checked by default', async ({ page }) => {
    await expect(page.locator('#auto-post-webhook')).toBeChecked();
  });

  test('shows Simple and Advanced webhook body radio options', async ({ page }) => {
    await expect(page.locator('#simple-webhook-body')).toBeVisible();
    await expect(page.locator('label[for="simple-webhook-body"]')).toContainText('Simple webhook body');

    await expect(page.locator('#advanced-webhook-body')).toBeVisible();
    await expect(page.locator('label[for="advanced-webhook-body"]')).toContainText('Advanced webhook body');
  });

  test('simple webhook body is selected by default', async ({ page }) => {
    await expect(page.locator('#simple-webhook-body')).toBeChecked();
    await expect(page.locator('#advanced-webhook-body')).not.toBeChecked();
  });

  test('can enter a webhook URL', async ({ page }) => {
    const input = page.locator('#webhook-url');
    await input.fill('https://hooks.example.com/test');
    await expect(input).toHaveValue('https://hooks.example.com/test');
  });

  test('auto-download checkbox is visible when auto-post webhook is enabled', async ({ page }) => {
    // auto-post-webhook is checked by default, which makes auto-download-file visible
    await expect(page.locator('#auto-post-webhook')).toBeChecked();
    await expect(page.locator('#auto-download-file')).toBeVisible();
  });

  test('can switch between Simple and Advanced webhook body', async ({ page }) => {
    await page.locator('#advanced-webhook-body').check();
    await expect(page.locator('#advanced-webhook-body')).toBeChecked();
    await expect(page.locator('#simple-webhook-body')).not.toBeChecked();

    await page.locator('#simple-webhook-body').check();
    await expect(page.locator('#simple-webhook-body')).toBeChecked();
    await expect(page.locator('#advanced-webhook-body')).not.toBeChecked();
  });

  test('shows empty state message when no meetings are stored', async ({ page }) => {
    await expect(page.locator('#meetings-table')).toContainText('Your next meeting will appear here');
  });

  test('renders a row for each seeded meeting', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/meetings.html`);
    await seedMeetings(page, MOCK_MEETINGS);
    await expect(page.locator('#meetings-table tr')).toHaveCount(MOCK_MEETINGS.length);
  });

  test('displays meeting titles in the table', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/meetings.html`);
    await seedMeetings(page, MOCK_MEETINGS);
    await expect(page.locator('#meetings-table')).toContainText('Q2 Product Review');
    await expect(page.locator('#meetings-table')).toContainText('1:1 with Manager');
    await expect(page.locator('#meetings-table')).toContainText('Design Review');
  });

  test('shows correct webhook status badges', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/meetings.html`);
    await seedMeetings(page, MOCK_MEETINGS);
    await expect(page.locator('.status-success').first()).toBeVisible();
    await expect(page.locator('.status-failed').first()).toBeVisible();
    await expect(page.locator('.status-new').first()).toBeVisible();
  });
});
