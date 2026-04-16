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
  'content-google-meet.js',
];

test.describe('Security', () => {

  test('extension ID is valid and not orphaned', async ({ extensionId }) => {
    expect(extensionId).not.toBe('invalid');
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('popup page makes no external network requests', async ({ page, extensionId }) => {
    const externalRequests = [];
    page.on('request', req => {
      const url = req.url();
      if (!url.startsWith(`chrome-extension://${extensionId}`)) {
        externalRequests.push(url);
      }
    });

    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole('heading', { name: 'meet-transcripts' })).toBeVisible();

    expect(externalRequests, `unexpected external requests: ${externalRequests.join(', ')}`).toHaveLength(0);
  });

  test('meetings page makes no external network requests', async ({ page, extensionId }) => {
    const externalRequests = [];
    page.on('request', req => {
      const url = req.url();
      if (!url.startsWith(`chrome-extension://${extensionId}`)) {
        externalRequests.push(url);
      }
    });

    await page.goto(`chrome-extension://${extensionId}/meetings.html`);
    await expect(page.getByRole('heading', { name: 'meet-transcripts' })).toBeVisible();

    expect(externalRequests, `unexpected external requests: ${externalRequests.join(', ')}`).toHaveLength(0);
  });

  test('extension source contains no upstream telemetry endpoints', () => {
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(path.join(extensionPath, file), 'utf-8');
      for (const pattern of TELEMETRY_PATTERNS) {
        expect(content, `${file} must not contain telemetry endpoint: ${pattern}`).not.toContain(pattern);
      }
    }
  });

  test('manifest name is meet-transcripts', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
    expect(manifest.name).toBe('meet-transcripts');
  });

  test('manifest declares only expected permissions', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
    const declared = manifest.permissions ?? [];
    const allowed = ['storage', 'downloads', 'scripting', 'notifications'];

    for (const perm of declared) {
      expect(allowed, `unexpected permission declared: ${perm}`).toContain(perm);
    }
  });

  test('manifest host_permissions are scoped to expected domains', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
    const hostPerms = manifest.host_permissions ?? [];
    const allowed = ['https://meet.google.com/*'];

    for (const perm of hostPerms) {
      expect(allowed, `unexpected host_permission: ${perm}`).toContain(perm);
    }
  });

  test('manifest optional_host_permissions contain no Zoom or Teams domains', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
    const optionalHostPerms = manifest.optional_host_permissions ?? [];
    const forbidden = ['zoom.us', 'teams.live.com', 'teams.microsoft.com'];

    for (const perm of optionalHostPerms) {
      for (const domain of forbidden) {
        expect(perm, `optional_host_permissions must not include ${domain}`).not.toContain(domain);
      }
    }
  });

  test('manifest has no declarative_net_request block', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
    expect(manifest.declarative_net_request).toBeUndefined();
  });

});
