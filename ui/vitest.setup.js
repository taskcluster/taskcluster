import { randomFillSync } from 'node:crypto';
import { vi } from 'vitest';

// required for slugid test
Object.defineProperty(window, 'crypto', {
  configurable: true,
  value: {
    getRandomValues(buffer) {
      return randomFillSync(buffer);
    },
  },
});

window.env = Object.assign({}, window.env, {
  TASKCLUSTER_ROOT_URL: 'https://taskcluster.net',
});

vi.useFakeTimers();
vi.setSystemTime(new Date('2022-02-17 13:00:00').getTime());
