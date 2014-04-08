suite('artifact extration tests', function() {
  var testworker = require('../testworker');

  test('extract artifact', function() {
    return testworker.submitTaskAndGetResults({
      image:          'ubuntu',
      command:        ['/bin/bash', '-c', 'echo "the user is:" > /username.txt; whoami >> /username.txt; echo "Okay, this is now done";'],
      features: {
        bufferLog:        true,
        azureLivelog:     false,
        extractArtifacts: true
      },
      artifacts: {
        // Name:              Source:
        'username.txt':       '/username.txt',
        'passwd.txt':         '/etc/passwd'
      },
      maxRunTime:         5 * 60
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;
      assert.equal(result.exitCode, 0);
      assert.ok(data.result.artifacts['username.txt'] !== undefined);
      assert.ok(data.result.artifacts['passwd.txt'] !== undefined);
    });
  });

  test('extract missing artifact', function() {
    return testworker.submitTaskAndGetResults({
      image:          'ubuntu',
      command:        ['/bin/bash', '-c', 'echo "the user is:" > /username.txt; whoami >> /username.txt; echo "Okay, this is now done";'],
      features: {
        bufferLog:        true,
        azureLivelog:     false,
        extractArtifacts: true
      },
      artifacts: {
        // Name:              Source:
        'my-missing.txt':     '/this-file-is-missing.txt'
      },
      maxRunTime:         5 * 60
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;
      assert.equal(result.exitCode, 0);
      assert.ok(result.missingArtifacts['my-missing.txt'] !== undefined);
    });
  });

  test('extract artifacts and missing artifact', function() {
    return testworker.submitTaskAndGetResults({
      image:          'ubuntu',
      command:        ['/bin/bash', '-c', 'echo "the user is:" > /username.txt; whoami >> /username.txt; echo "Okay, this is now done";'],
      features: {
        bufferLog:        true,
        azureLivelog:     false,
        extractArtifacts: true
      },
      artifacts: {
        // Name:              Source:
        'username.txt':       '/username.txt',
        'passwd.txt':         '/etc/passwd',
        'my-missing.txt':     '/this-file-is-missing.txt'
      },
      maxRunTime:         5 * 60
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;
      assert.equal(result.exitCode, 0);
      assert.ok(data.result.artifacts['username.txt'] !== undefined);
      assert.ok(data.result.artifacts['passwd.txt'] !== undefined);
      assert.ok(data.result.artifacts['my-missing.txt'] === undefined);
      assert.ok(result.missingArtifacts['my-missing.txt'] !== undefined);
    });
  });
});
