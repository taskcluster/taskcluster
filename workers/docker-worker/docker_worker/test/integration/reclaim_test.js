suite('reclaim timeout', function() {
  var testworker = require('../testworker');

  test('extract artifacts', function() {
    return testworker.submitTaskAndGetResults({
      image:          'ubuntu',
      command:        ['/bin/bash', '-c', 'sleep 65'], // terrible but there is no other way to
      features: {
        bufferLog:        true
      },
    }).then(function(data) {
      var result = data.result;
      // XXX: result clearly is not a great name for both levels here.
      var output = result.result;
      assert.equal(output.exitCode, 0);
    });
  });
});
