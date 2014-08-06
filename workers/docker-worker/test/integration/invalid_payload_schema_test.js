suite('Invalid payload schema', function() {
  var co = require('co');
  var testworker = require('../post_task');

  test('invalid schema', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'ubuntu',
        // No command is an invalid schema.
        command: [],
        features: { bufferLog: true },
        maxRunTime: 5 * 60
      }
    });

    assert.ok(!result.run.success, 'invalid schema should fail');
    assert.ok(result.log.indexOf('schema errors' !== -1));
  }));
});
