export class BasePage {
  constructor(page) {
    this.page = page;
  }

  async navigate(path, { timeout = 60000, settleTimeout = 30000 } = {}) {
    const inFlight = new Set();
    const isLongPoll = (req) => req.url().includes('/sockjs-node/');
    this.page.on('request', (req) => { if (!isLongPoll(req)) inFlight.add(req); });
    this.page.on('requestfinished', (req) => inFlight.delete(req));
    this.page.on('requestfailed', (req) => inFlight.delete(req));

    await this.page.goto(path, { waitUntil: 'load', timeout });

    const start = Date.now();
    while (inFlight.size > 0 && Date.now() - start < settleTimeout) {
      await new Promise((r) => setTimeout(r, 100));
    }

    return [...inFlight];
  }

  async hasNotFound() {
    return this.page.evaluate(() =>
      document.body.textContent.includes("couldn't find a page at that address")
    ).catch(() => false);
  }
}
