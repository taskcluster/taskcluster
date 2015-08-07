suite('setting env variables', function() {
  var co = require('co');
  var testworker = require('../post_task');

  test('echo env variable', co(function* () {
    var expected = 'is woot';
    var result = yield testworker({
      payload: {
        image:          'taskcluster/test-ubuntu',
        env:            { WOOTBAR: expected },
        command:        ['/bin/bash', '-c', 'echo $WOOTBAR'],
        features: {
          bufferLog:    true,
          azureLiveLog: false
        },
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(result.log.indexOf(expected) !== -1, 'env is dumped');
  }));
});

