import { test, expect } from './fixtures/extension.js';

const MOCK_MEETINGS = [
  {
    software: 'Google Meet',
    title: 'Q2 Product Review',
    startTimestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    endTimestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    transcript: [],
    chatMessages: [],
    webhookPostStatus: 'successful',
  },
  {
    software: 'Google Meet',
    title: '1:1 with Manager',
    startTimestamp: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    endTimestamp: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    transcript: [],
    chatMessages: [],
    webhookPostStatus: 'failed',
  },
  {
    software: 'Google Meet',
    title: 'Design Review',
    startTimestamp: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    endTimestamp: new Date(Date.now() - 70.5 * 60 * 60 * 1000).toISOString(),
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
    await expect(page.locator('h1')).toHaveText('Meet Transcripts');
    await expect(page.locator('#last-10-meetings h2')).toHaveText('Last 10 meetings');
    await expect(page.locator('#recover-last-meeting')).toBeVisible();
    await expect(page.locator('#webhooks h2')).toHaveText('Webhooks');
    await expect(page.locator('#webhook-url')).toBeVisible();
    await expect(page.locator('#save-webhook')).toBeVisible();
    const headers = page.locator('table thead th');
    await expect(headers.nth(0)).toHaveText('Meeting title');
    await expect(headers.nth(1)).toHaveText('Meeting software');
    await expect(headers.nth(2)).toHaveText('Meeting start time and duration');
    await expect(headers.nth(3)).toHaveText('Webhook status');
  });

  test('shows empty state message when no meetings are stored', async ({ page }) => {
    await expect(page.locator('#meetings-table')).toContainText('Your next meeting will appear here');
  });

  test('webhook configuration defaults — auto-post checked, simple body selected', async ({ page }) => {
    await expect(page.locator('#auto-post-webhook')).toBeChecked();
    await expect(page.locator('#simple-webhook-body')).toBeChecked();
    await expect(page.locator('#advanced-webhook-body')).not.toBeChecked();
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

  test('webhook URL persists after save and page reload', async ({ page }) => {
    const url = 'https://hooks.example.com/my-webhook';
    await page.locator('#webhook-url').fill(url);
    await page.locator('#save-webhook').click();
    await page.reload();
    await expect(page.locator('#webhook-url')).toHaveValue(url);
  });

  test('renders a row for each seeded meeting with correct titles', async ({ page }) => {
    await seedMeetings(page, MOCK_MEETINGS);
    await expect(page.locator('#meetings-table tr')).toHaveCount(MOCK_MEETINGS.length);
    await expect(page.locator('#meetings-table')).toContainText('Q2 Product Review');
    await expect(page.locator('#meetings-table')).toContainText('1:1 with Manager');
    await expect(page.locator('#meetings-table')).toContainText('Design Review');
  });

  test('shows correct webhook status badges for all three statuses', async ({ page }) => {
    await seedMeetings(page, MOCK_MEETINGS);
    await expect(page.locator('.status-success').first()).toBeVisible();
    await expect(page.locator('.status-failed').first()).toBeVisible();
    await expect(page.locator('.status-new').first()).toBeVisible();
  });

  test('renders meeting title as plain text, not HTML (XSS guard)', async ({ page }) => {
    const xssPayload = '<img src=x onerror=window.__xss=1>';
    await seedMeetings(page, [{ ...MOCK_MEETINGS[0], title: xssPayload }]);
    await expect(page.locator('.meeting-title').first()).toHaveText(xssPayload);
    const xssTriggered = await page.evaluate(() => window.__xss);
    expect(xssTriggered).toBeUndefined();
  });

  test('delete button removes the meeting row after confirmation', async ({ page }) => {
    await seedMeetings(page, MOCK_MEETINGS);
    await expect(page.locator('#meetings-table tr')).toHaveCount(MOCK_MEETINGS.length);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.delete-button').first().click();
    await expect(page.locator('#meetings-table tr')).toHaveCount(MOCK_MEETINGS.length - 1);
  });

  test('download button sends download_transcript_at_index message', async ({ page }) => {
    await seedMeetings(page, MOCK_MEETINGS);
    const sentMessages = await page.evaluate(() => {
      const msgs = [];
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (msg, cb) => { msgs.push(msg); if (cb) cb({ success: true }); };
      window.__sentMessages = msgs;
      return msgs;
    });
    await page.locator('.download-button').first().click();
    const messages = await page.evaluate(() => window.__sentMessages);
    expect(messages.some(m => m.type === 'download_transcript_at_index')).toBe(true);
  });
});
