import { test, expect } from './fixtures/extension.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '../extension');

const TELEMETRY_PATTERNS = [
  'script.google.com',
  'ejnana.github.io',
];

const SOURCE_FILES = [
  'background.js',
  'google-meet.js',
  'popup.js',
  'meetings.js',
];

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
  let manifest;

  test.beforeAll(() => {
    manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
  });

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
      `chrome-extension://${extensionId}/meetings.html`
    );
    expect(external, `unexpected external requests: ${external.join(', ')}`).toHaveLength(0);
  });

  test('extension source contains no upstream telemetry endpoints', () => {
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(path.join(extensionPath, file), 'utf-8');
      for (const pattern of TELEMETRY_PATTERNS) {
        expect(content, `${file} must not contain telemetry endpoint: ${pattern}`).not.toContain(pattern);
      }
    }
  });

  test('manifest name is Meet Transcripts', () => {
    expect(manifest.name).toBe('Meet Transcripts');
  });

  test('manifest declares only expected permissions', () => {
    const allowed = ['storage', 'downloads', 'scripting', 'notifications', 'activeTab'];
    for (const perm of manifest.permissions ?? []) {
      expect(allowed, `unexpected permission declared: ${perm}`).toContain(perm);
    }
  });

  test('manifest host_permissions are scoped to expected domains', () => {
    const allowed = ['https://meet.google.com/*'];
    for (const perm of manifest.host_permissions ?? []) {
      expect(allowed, `unexpected host_permission: ${perm}`).toContain(perm);
    }
  });

  test('manifest optional_host_permissions contain no Zoom or Teams domains', () => {
    const forbidden = ['zoom.us', 'teams.live.com', 'teams.microsoft.com'];
    for (const perm of manifest.optional_host_permissions ?? []) {
      for (const domain of forbidden) {
        expect(perm, `optional_host_permissions must not include ${domain}`).not.toContain(domain);
      }
    }
  });

  test('manifest has no declarative_net_request block', () => {
    expect(manifest.declarative_net_request).toBeUndefined();
  });
});
