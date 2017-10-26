const assert = require('assert');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('Shutdown on idle', () => {
  suite('with retrict CPU enabled', () => {
    var worker;
    setup(async function () {
      settings.configure({
        restrictCPU: true
      });

      worker = new TestWorker(DockerWorker);
    });

    // Ensure we don't leave behind our test configurations.
    teardown(async function () {
      await worker.terminate();
      settings.cleanup();
    });

    test('cycle through cores', async function() {
      await worker.launch();

      let tasks = 10;
      while (tasks--) {
        var res = await worker.postToQueue({
          payload: {
            image: 'taskcluster/test-ubuntu',
            command: cmd(
              'echo "Processors: $(nproc)"'
            ),
            maxRunTime: 60 * 60
          }
        });

        assert.ok(res.log.includes('Processors: 1'), 'container is only using one core');
      }
    });
  });

});
