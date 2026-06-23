import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  envPrefix: ['TASKCLUSTER_ROOT_URL', 'NO_TEST_SKIP'],
  plugins: [nodePolyfills()],
  test: {
    globals: true,
    testTimeout: 30000,
    include: ['test/*_test.js'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'firefox' }],
    },
  },
});
