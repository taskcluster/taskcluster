const assert = require('assert');
const testworker = require('../post_task');
const cmd = require('./helper/cmd');

suite('Task duration stats', () => {
  test('1s long task minimum', async () => {
    var result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'sleep 1'
        ),
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    var duration = new Date(result.run.resolved) - new Date(result.run.started);
    assert.ok(duration > 1000, `Duration should exist and be greater then 1s, but it was ${duration} ms`);
  });
});
