suite('stop request', function() {
  var testworker = require('../testworker');

  test('timing metrics', function() {
    return testworker.submitTaskAndGetResults({
      image:            'ubuntu',
      command:          ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        bufferLog:      false,
        azureLiveLog:   false
      },
      maxRunTime:         5 * 60
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;
      assert.equal(result.exitCode, 0);
      assert.ok(result.startTimestamp, 'has start time');
      assert.ok(result.stopTimestamp, 'has stop time');
    });
  });
});

