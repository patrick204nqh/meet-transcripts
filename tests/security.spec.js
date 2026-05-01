import { test, expect } from './fixtures/extension.js';

// Static manifest and source-file checks live in tests/unit/security.test.ts (Vitest — no browser needed).
// This file keeps only the two tests that require a real browser context.

async function collectExternalRequests(page, extensionId, url) {
  const external = [];
  page.on('request', req => {
    if (!req.url().startsWith(`chrome-extension://${extensionId}`)) {
      external.push(req.url());
    }
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Meet Transcripts' })).toBeVisible();
  return external;
}

test.describe('Security', () => {
  test('extension ID is valid and not orphaned', async ({ extensionId }) => {
    expect(extensionId).not.toBe('invalid');
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('popup page makes no external network requests', async ({ page, extensionId }) => {
    const external = await collectExternalRequests(
      page, extensionId,
      `chrome-extension://${extensionId}/popup.html`
    );
    expect(external, `unexpected external requests: ${external.join(', ')}`).toHaveLength(0);
  });

  test('meetings page makes no external network requests', async ({ page, extensionId }) => {
    const external = await collectExternalRequests(
      page, extensionId,
      `chrome-extension://${extensionId}/app.html#meetings`
    );
    expect(external, `unexpected external requests: ${external.join(', ')}`).toHaveLength(0);
  });
});
