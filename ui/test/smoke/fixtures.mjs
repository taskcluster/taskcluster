import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  issues: async ({ page }, use) => {
    const issues = {
      pageerror: [],
      consoleError: [],
      requestfailed: [],
      httpError: [],
    };

    page.on('pageerror', (err) => issues.pageerror.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (text.startsWith('Warning:')) return;
      issues.consoleError.push(text);
    });
    page.on('requestfailed', (req) => {
      const err = req.failure()?.errorText || 'unknown';
      if (err === 'net::ERR_ABORTED') return;
      if (req.url().includes('/sockjs-node/')) return;
      issues.requestfailed.push(`${req.method()} ${req.url()} (${err})`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) issues.httpError.push(`${res.status()} ${res.url()}`);
    });

    await use(issues);
  },
});

export { expect };
