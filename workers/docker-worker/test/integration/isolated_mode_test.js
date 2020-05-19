const assert = require('assert');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  suite('with retrict CPU enabled', () => {
    let worker;
    setup(async function () {
      settings.configure({
        restrictCPU: true,
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
        let res = await worker.postToQueue({
          payload: {
            image: 'taskcluster/test-ubuntu',
            command: cmd(
              'echo "Processors: $(nproc)"',
            ),
            maxRunTime: 60 * 60,
          },
        });

        assert.ok(res.log.includes('Processors: 1'), 'container is only using one core');
      }
    });
  });

});
