import { randomFillSync } from 'node:crypto';
import { format } from 'node:util';
import { afterAll, afterEach, vi } from 'vitest';

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

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2022-02-17 13:00:00').getTime());

let unexpectedOutput = null;
for (const level of ['error', 'warn']) {
  const original = console[level];

  console[level] = (...args) => {
    unexpectedOutput ??= `console.${level}: ${format(...args)}`;
    original(...args);
  };
}

const failOnConsoleOutput = () => {
  if (unexpectedOutput) {
    const message = unexpectedOutput;

    unexpectedOutput = null;
    throw new Error(`Unexpected ${message}`);
  }
};

afterEach(failOnConsoleOutput);
// Catches output emitted in other `afterAll` hooks
afterAll(failOnConsoleOutput);
