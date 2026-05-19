import { defineConfig } from '@playwright/test';

const PORT = process.env.PORT || 5080;

export default defineConfig({
  testDir: './test/smoke',
  timeout: 90000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${PORT}`,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  outputDir: './smoke-screenshots',
});
