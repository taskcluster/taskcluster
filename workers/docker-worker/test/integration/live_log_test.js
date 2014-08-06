suite('live logging', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../post_task');

  test('live logging of content', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'echo "first command!"; ' +
          'for i in {1..1000}; do echo "Hello Number $i"; done;'
        ],
        maxRunTime: 5 * 60
      }
    });

    // Expected junk in the log.
    var log = '';
    for (var i = 1; i <= 1000; i++) {
      log += 'Hello Number ' + i + '\r\n';
    }

    assert.ok(result.run.success, 'task success');
    assert.ok(result.log.indexOf(log) !== -1, 'contains each expected line');
  }));
});
