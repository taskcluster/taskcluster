suite('Shutdown on idle', function() {
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  suite('with retrict CPU enabled', function() {
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
        let lines = res.log.trim().split('\r\n');
        // Do not rely on a static line number since image pulls and other things
        // can log before this.
        let procInfoLine = lines[lines.indexOf('Processors: 1')];
        assert.equal(procInfoLine, 'Processors: 1', 'container is only using one core');
      }
    });
  });

});
