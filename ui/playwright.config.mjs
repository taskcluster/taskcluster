import { defineConfig } from '@playwright/test';

const PORT = process.env.PORT || 5080;
const TASKCLUSTER_ROOT_URL =
  process.env.TASKCLUSTER_ROOT_URL || 'https://community-tc.services.mozilla.com';

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
  webServer: {
    command: 'corepack yarn start',
    url: `http://localhost:${PORT}`,
    timeout: 300000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), TASKCLUSTER_ROOT_URL },
  },
});
