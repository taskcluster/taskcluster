suite('Task duration stats', function() {
  var co = require('co');
  var testworker = require('../post_task');
  var cmd = require('./helper/cmd');

  test('1s long task minimum', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'sleep 1'
        ),
        features: {
          bufferLog:    true,
          azureLiveLog: false
        },
        maxRunTime: 5 * 60
      }
    });

    var duration = new Date(result.run.resolved) - new Date(result.run.started);
    assert.ok(duration > 1000, 'Duration should exist and be greater then 1s');
  }));
});
