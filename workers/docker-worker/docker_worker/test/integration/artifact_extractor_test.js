suite('artifact extration tests', function() {
  var testworker = require('../testworker');

  test('extract artifacts', function() {
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
      }
    }).then(function(data) {
      // Get task specific results
      var result = data.result.result;
      console.log(data.result);
      assert.equal(result.exitCode, 0);
      assert.ok(data.result.artifacts['username.txt'] !== undefined);
      assert.ok(data.result.artifacts['passwd.txt'] !== undefined);
      // XXX: As of docker version 0.9.1 we don't know when files are missing
      // this is likely a bug as it reports it as an error in docker.log.
      //assert.ok(data.result.artifacts['my-missing.txt'] === undefined);
      //assert.ok(result.missingArtifacts['my-missing.txt'] !== undefined);
    });
  });
});
