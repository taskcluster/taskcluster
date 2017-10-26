const assert = require('assert');
const testworker = require('../post_task');

suite('setting env variables', () => {
  test('echo env variable', async () => {
    let expected = 'is woot';
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        env: {WOOTBAR: expected},
        command: ['/bin/bash', '-c', 'echo $WOOTBAR'],
        maxRunTime: 5
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(result.log.indexOf(expected) !== -1, 'env is dumped');
  });

  test('default task env variables', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: ['/bin/bash', '-c', 'printenv'],
        maxRunTime: 5
      }
    });

    assert.ok(
      result.log.includes(`TASKCLUSTER_WORKER_TYPE=${result.status.workerType}`),
      'Log does not contain taskcluster worker type environment variable'
    );

    assert.ok(
      result.log.includes('TASKCLUSTER_WORKER_GROUP=random-local-worker'),
      'Log does not contain taskcluster worker group environment variable'
    );

    assert.ok(
      result.log.includes('TASKCLUSTER_INSTANCE_TYPE=test-worker'),
      'Log does not contain taskcluster worker instance type environment variable'
    );

    assert.ok(
      result.log.includes('TASKCLUSTER_PUBLIC_IP=127.0.0.1'),
      'Log does not contain public IP address environment variable'
    );

    assert.ok(
      result.log.includes(`TASK_ID=${result.taskId}`),
      'Log does not contain task id environment variable'
    );

    assert.ok(
      result.log.includes('RUN_ID=0'),
      'Log does not contain run id environment variable'
    );
  });
});

