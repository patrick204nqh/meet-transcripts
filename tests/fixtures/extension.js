import { test as base, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '../../extension');

/**
 * Extended test fixture that launches Chromium with the extension loaded.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/extension.js';
 *
 *   test('my test', async ({ page, extensionId }) => {
 *     await page.goto(`chrome-extension://${extensionId}/popup.html`);
 *   });
 */
export const test = base.extend({
  // Persistent context with the extension loaded — shared for the duration of each test
  context: async ({}, use) => {
    const headed = process.env.HEADED === '1'
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // Always false — prevents Playwright from injecting the legacy --headless flag,
      // which Chrome ignores in favour of --headless=new but breaks extension service workers.
      headless: false,
      args: [
        ...(!headed ? ['--headless=new'] : []),
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  // Resolves the extension's chrome:// ID by waiting for the service worker
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    // Service worker URL format: chrome-extension://<id>/background.js
    const extensionId = worker.url().split('/')[2];
    await use(extensionId);
  },

  // Convenience: a fresh page attached to the extension context
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export const { expect } = test;
