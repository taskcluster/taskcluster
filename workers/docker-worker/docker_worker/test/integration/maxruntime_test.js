suite('worker timeouts', function() {
  var testworker = require('../testworker');

  test('worker sleep more than maxRunTime', function() {
    return testworker.submitTaskAndGetResults({
      image:          'ubuntu',
      command:        ['/bin/bash', '-c', 'echo "Hello"; sleep 180; echo "done";'],
      features: {
        bufferLog:    true,
        azureLiveLog: false
      },
      maxRunTime:         10
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;

      assert.ok(result.exitCode != 0);
      assert.ok(result.logText.indexOf('Hello') !== -1);
      assert.ok(result.logText.indexOf('done') === -1);
    });
  });
});

