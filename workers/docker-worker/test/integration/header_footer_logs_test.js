suite('Header/Footer logs', function() {
  var co = require('co');
  var testworker = require('../post_task');
  var cmd = require('./helper/cmd');

  test('Unsuccessful task', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'exit 5'
        ),
        features: {
          bufferLog:    true
        },
        maxRunTime:         5 * 60
      }
    });

    var tcLogs = result.log.match(/\[taskcluster\](.*)/g);
    var start = tcLogs[0];
    var end = tcLogs[tcLogs.length-1];

    // ensure task id in in the start...
    assert.ok(start.indexOf(result.taskId) !== -1, 'start log has taskId');
    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(
      end.indexOf('Unsuccessful') !== -1, 'end has human readable failure'
    );
    assert.ok(end.indexOf('exit code: 5') !== -1, 'end has exit code');
  }));
});
