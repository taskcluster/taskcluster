suite('logging to artifact', function() {
  var co = require('co');
  var testworker = require('../../post_task');
  var getArtifact = require('../helper/get_artifact');

  test('artifact logger', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'echo "first command!";' +
          'for i in {1..1000}; do echo "Hello Number $i"; done;'
        ],
        features: {
          liveLog: true,
          bulkLog: true
        },
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');

    // Expected junk in the log.
    var log = '';
    for (var i = 1; i <= 1000; i++) {
      log += 'Hello Number ' + i + '\r\n';
    }

    var content = yield getArtifact(
      result, result.artifacts['public/logs/terminal_bulk.log.gz'].name
    );

    assert.ok(
      content.indexOf(log) !== -1, 'bulk log contains correct number of lines'
    );

    assert.equal(
      content, result.log, 'livelog and bulk log should be identical'
    );
  }));
});
