suite('live logging', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../../post_task');
  var getArtifact = require('../helper/get_artifact');

  test('live logging of content', co(function* () {
    var result = yield testworker({
      payload: {
        features: {
          azureLiveLog: true,
          localLiveLog: false
        },
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'echo "first command!"; ' +
          'for i in {1..1000}; do echo "Hello Number $i"; done;'
        ],
        maxRunTime: 5 * 60
      }
    });

    // Expected junk in the log.
    var log = '';
    for (var i = 1; i <= 1000; i++) {
      log += 'Hello Number ' + i + '\r\n';
    }

    var azureLiveLog = yield getArtifact(
      { taskId: result.taskId, runId: result.runId },
      'public/logs/azure_live.log'
    );

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(azureLiveLog.indexOf(log) !== -1, 'contains each expected line');
  }));
});
