const assert = require('assert');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('Signals test', () => {
  let worker;
  setup(() => {
    settings.cleanup();
    settings.configure({
      shutdown: {
        enabled: true,
        afterIdleSeconds: 5,
      }
    });

    worker = new TestWorker(DockerWorker);
  });

  teardown(async () => {
    try {
      await worker.terminate();
      settings.cleanup();
    } catch(e) {
      settings.cleanup();
    }
  });

  test('SIGTERM', async () => {
    await worker.launch();

    worker.once('task run', async () => {
      await worker.worker.process.container.kill({signal: 'SIGTERM'});
    });

    const res = await worker.postToQueue({
      payload: {
        features: {
          localLiveLog: false,
        },
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'sleep 30'
        ),
        maxRunTime: 60,
      },
    });
    assert.equal(res.status.runs[0].state, 'exception');
    assert.equal(res.status.runs[0].reasonResolved, 'worker-shutdown');
  });
});
