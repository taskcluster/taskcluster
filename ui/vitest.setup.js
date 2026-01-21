import React from 'react';
import { vi } from 'vitest';
import crypto from 'crypto';

// Mock useLayoutEffect to useEffect
React.useLayoutEffect = React.useEffect;

// Setup window.crypto (use defineProperty because crypto is read-only in jsdom)
Object.defineProperty(window, 'crypto', {
  value: {
    getRandomValues: function (buffer) {
      return crypto.randomFillSync(buffer);
    }
  },
  writable: true,
  configurable: true
});

// Setup window.env
window.env = Object.assign({}, window.env, {
  TASKCLUSTER_ROOT_URL: 'https://taskcluster.net',
});

// Setup fake timers
vi.useFakeTimers();
vi.setSystemTime(new Date('2022-02-17 13:00:00'));

// Mock localforage (browser storage) for jsdom environment
vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    length: vi.fn(() => Promise.resolve(0)),
    key: vi.fn(() => Promise.resolve(null)),
    keys: vi.fn(() => Promise.resolve([])),
    iterate: vi.fn(() => Promise.resolve()),
    config: vi.fn(),
  },
}));
