const assert = require('assert');
const testworker = require('../../post_task');
const getArtifact = require('../helper/get_artifact');

suite('logging to artifact', () => {
  test('artifact logger', async () => {
    var result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'echo "first command!";' +
          'for i in {1..1000}; do echo "Hello Number $i"; done;'
        ],
        features: {
          localLiveLog: true,
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

    var content = await getArtifact(
      result, result.artifacts['public/logs/terminal_bulk.log.gz'].name
    );

    assert.ok(
      content.indexOf(log) !== -1, 'bulk log contains correct number of lines'
    );

    assert.equal(
      content, result.log, 'livelog and bulk log should be identical'
    );
  });
});
