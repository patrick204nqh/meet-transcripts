// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Chrome extensions require a headed browser — headless mode cannot load extensions.
  // For CI without a display server, wrap with: xvfb-run npm test
  use: {
    headless: false,
    trace: 'on-first-retry',
  },
  // Sequential workers: extension tests share a persistent browser context per test
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
});
