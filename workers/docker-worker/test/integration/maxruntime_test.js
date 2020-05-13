const assert = require('assert');
const testworker = require('../post_task');

suite('worker timeouts', () => {
  test('worker sleep more than maxRunTime', async () => {
    var result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash', '-c', 'echo "Hello"; sleep 20; echo "done";'
        ],
        features: {},
        maxRunTime: 10
      }
    });
    // Get task specific results
    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(result.log.indexOf('Hello') !== -1);
    assert.ok(result.log.indexOf('done') === -1);
    assert.ok(
      result.log.indexOf('[taskcluster:error] Task timeout') !== -1,
      'Task should contain logs about timeout'
    );
  });
});
