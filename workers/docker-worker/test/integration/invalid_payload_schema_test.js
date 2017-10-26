const assert = require('assert');
const testworker = require('../post_task');

suite('Invalid payload schema', () => {

  test('invalid maxruntime', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        features: {bufferLog: true},
        // maxRunTime should be a number.
        maxRunTime: 'hello'
      }
    });

    assert.equal(result.run.state, 'exception', 'invalid schema should fail');
    assert.equal(result.run.reasonResolved, 'malformed-payload', 'invalid schema should fail');
    assert.ok(result.log.includes('schema errors'));
  });

  test('invalid artifact expiration', async () => {
    let expiration = new Date();
    expiration.setFullYear(expiration.getFullYear() + 2);
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        cmd: ['/bin/bash', '-c', 'ls'],
        maxRunTime: 60,
        artifacts: {
          'public/xfoo': {
            type: 'file',
            // expiration should not be past task.expires (default to 1 year if not specified)
            expires: expiration,
            path: '/artifacts/xfoo.txt'
          }
        }
      }
    });

    assert.equal(result.run.state, 'exception', 'invalid schema should fail');
    assert.equal(result.run.reasonResolved, 'malformed-payload', 'invalid schema should fail');
    assert.ok(result.log.includes('must not be greater than task expiration'));
  });

  test('invalid exit status - status string not number', async () => {
    let expiration = new Date();
    expiration.setFullYear(expiration.getFullYear() + 2);
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        cmd: ['/bin/bash', '-c', 'ls'],
        maxRunTime: 60,
        onExitStatus: {
          retry: ['1']
        }
      }
    });

    assert.equal(result.run.state, 'exception', 'invalid schema should fail');
    assert.equal(result.run.reasonResolved, 'malformed-payload', 'invalid schema should fail');
    assert(result.log.includes('data.onExitStatus.retry[0] should be number', 'message missing about onExitStatus'));
  });

  test('invalid schema with multiple errors', async () => {
    let expiration = new Date();
    expiration.setFullYear(expiration.getFullYear() + 2);
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        cmd: ['/bin/bash', '-c', 'ls'],
        // maxRunTime should be a number
        maxRunTime: 'hello',
        artifacts: {
          'public/xfoo': {
            type: 'file',
            // expiration should not be past task.expires (default to 1 year if not specified)
            expires: expiration,
            path: '/artifacts/xfoo.txt'
          }
        }
      }
    });

    assert.equal(result.run.state, 'exception', 'invalid schema should fail');
    assert.equal(result.run.reasonResolved, 'malformed-payload', 'invalid schema should fail');
    assert.ok(result.log.includes('format is invalid json schema errors'));
    assert.ok(result.log.includes('must not be greater than task expiration'));
    assert.ok(result.log.includes('maxRunTime'));
  });
});
