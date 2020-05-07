const waitForEvent = require('../../src/lib/wait_for_event');
const settings = require('../settings');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const assert = require('assert');

suite('Aliveness check', function() {
  // Ensure we don't leave behind our test configurations.
  teardown(async () => {
    await worker.terminate();
    settings.cleanup();
  });

  let worker;
  setup(async () => {
    settings.configure({
      alivenessCheckInterval: 200, // 200ms
    });

    worker = new TestWorker(DockerWorker);
  });

  test('Aliveness check pings', async () => {
    // So we don't immediately shutdown.
    await worker.launch();

    let checks = 20;

    let now = Date.now();
    while (checks-- > 0) {
      await waitForEvent(worker, 'aliveness check');
    }
    let end = Date.now();
    assert.ok(end - now > 2000, 'aliveness check ran over 2s');
  });
});
