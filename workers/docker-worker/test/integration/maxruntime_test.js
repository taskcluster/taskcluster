const assert = require('assert');
const testworker = require('../post_task');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  test('worker sleep more than maxRunTime', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash', '-c', 'echo "Hello"; sleep 20; echo "done";',
        ],
        features: {},
        maxRunTime: 10,
      },
    });
    // Get task specific results
    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(result.log.indexOf('Hello') !== -1);
    assert.ok(result.log.indexOf('done') === -1);
    assert.ok(
      result.log.indexOf('[taskcluster:error] Task timeout') !== -1,
      'Task should contain logs about timeout',
    );
  });
});
