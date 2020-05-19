const waitForEvent = require('../../src/lib/wait_for_event');
const settings = require('../settings');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const assert = require('assert');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

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
