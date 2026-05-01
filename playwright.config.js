// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'e2e',
      testDir: './tests',
      testIgnore: '**/screenshots/**',
    },
    {
      name: 'screenshots',
      testDir: './tests/screenshots',
    },
  ],
});
