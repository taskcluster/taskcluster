suite('setting env variables', function() {
  var testworker = require('../testworker');

  test('echo env variable', function() {
    var expected = 'is woot';
    return testworker.submitTaskAndGetResults({
      image:          'ubuntu',
      env:            { WOOTBAR: expected },
      command:        ['/bin/bash', '-c', 'echo $WOOTBAR'],
      features: {
        bufferLog:    true,
        azureLivelog: false
      }
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;

      assert.equal(result.exitCode, 0);
      assert.ok(result.logText.indexOf(expected) !== -1);
    });
  });
});

