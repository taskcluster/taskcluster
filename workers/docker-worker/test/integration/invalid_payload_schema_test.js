suite('Invalid payload schema', function() {
  var co = require('co');
  var testworker = require('../post_task');

  test('invalid schema', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        features: { bufferLog: true },
        // maxRunTime should be a number.
        maxRunTime: 'hello'
      }
    });

    assert.equal(result.run.state, 'exception', 'invalid schema should fail');
    assert.equal(result.run.reasonResolved, 'malformed-payload', 'invalid schema should fail');
    assert.ok(result.log.indexOf('schema errors') !== -1);
  }));
});
