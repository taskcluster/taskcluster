suite('buffer log test', function() {
  var testworker = require('../testworker');

  test('simple echo', function() {
    return testworker.submitTaskAndGetResults({
      image:          'ubuntu',
      command:        ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        bufferLog:    true,
        azureLiveLog: false
      },
      maxRunTime:         5 * 60
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;

      assert.equal(result.exitCode, 0);
      assert.ok(result.logText.indexOf('first') !== -1);
    });
  });
});