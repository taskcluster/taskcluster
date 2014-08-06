suite('setting env variables', function() {
  var co = require('co');
  var testworker = require('../post_task');

  test('echo env variable', co(function* () {
    var expected = 'is woot';
    var result = yield testworker({
      payload: {
        image:          'ubuntu',
        env:            { WOOTBAR: expected },
        command:        ['/bin/bash', '-c', 'echo $WOOTBAR'],
        features: {
          bufferLog:    true,
          azureLiveLog: false
        },
        maxRunTime: 5 * 60
      }
    });

    assert.ok(result.run.success, 'task should be successful');
    assert.ok(result.log.indexOf(expected) !== -1, 'env is dumped');
  }));
});

