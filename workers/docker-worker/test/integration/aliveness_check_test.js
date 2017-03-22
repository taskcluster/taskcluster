import waitForEvent from '../../build/lib/wait_for_event';
import * as settings from '../settings';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

suite('Aliveness check', function() {
  // Ensure we don't leave behind our test configurations.
  teardown(async () => {
    await worker.terminate();
    settings.cleanup();
  });

  var worker;
  setup(async () => {
    settings.configure({
      alivenessCheckInterval: 200, // 200ms
    });

    worker = new TestWorker(DockerWorker);
  });

  test('Aliveness check pings', async () => {
    // So we don't immediately shutdown.
    await worker.launch();

    var checks = 20;

    var now = Date.now();
    while (checks-- > 0) {
      await waitForEvent(worker, 'aliveness check');
    }
    var end = Date.now();
    assert.ok(end - now > 2000, 'aliveness check ran over 2s');
  });
});

