// @ts-check
/**
 * Screenshot capture suite — generates UI assets for the README.
 * Tagged @screenshots so it only runs when explicitly requested:
 *   npx playwright test --grep @screenshots
 */
import { test } from '../fixtures/extension.js';
import { MOCK_MEETINGS } from '../fixtures/mock-data.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../../docs/assets');

test('@screenshots capture popup screenshot', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 400, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForSelector('.mode-toggle');
  await page.screenshot({
    path: path.join(OUT, 'popup.png'),
    clip: { x: 0, y: 0, width: 400, height: 420 },
  });
});

test('@screenshots capture meetings page — with data', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/app.html#meetings`);
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate((meetings) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ meetings }, resolve);
    });
  }, MOCK_MEETINGS);

  await page.reload();
  // Wait until at least one meeting row is rendered
  await page.waitForSelector('#meetings-table tr');

  const tableContainer = page.locator('#last-10-meetings');
  await tableContainer.screenshot({ path: path.join(OUT, 'meetings-table.png') });
});

test('@screenshots capture settings page screenshot', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
  await page.waitForSelector('#webhook-url');

  // Pre-open the payload reference details so they show in the screenshot
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(d => { d.open = true; });
  });

  await page.screenshot({ path: path.join(OUT, 'settings.png'), fullPage: true });
});
