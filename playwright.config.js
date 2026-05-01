// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // CI gets one worker (extension load is serial-safe there); locally use hardware parallelism
  workers: process.env.CI ? 1 : undefined,
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
