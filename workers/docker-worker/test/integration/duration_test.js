const assert = require('assert');
const testworker = require('../post_task');
const cmd = require('./helper/cmd');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  test('1s long task minimum', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'sleep 1',
        ),
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    let duration = new Date(result.run.resolved) - new Date(result.run.started);
    assert.ok(duration > 1000, `Duration should exist and be greater then 1s, but it was ${duration} ms`);
  });
});
