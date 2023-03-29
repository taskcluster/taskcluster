const assert = require('assert');
const slugid = require('slugid');
const settings = require('../settings');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const { suiteName } = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  test('setup timeout', async () => {
    settings.configure({
      task: {
        maxSetupTime: 0.01, // 10ms
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash', '-c', 'echo "Hello"; sleep 60; echo "done";',
        ],
        features: {
          localLiveLog: false,
        },
        maxRunTime: 60 * 60,
      },
    };
    let taskId = slugid.v4();
    let worker = new TestWorker(DockerWorker);
    let abortedTask;
    worker.on('task aborted', () => abortedTask = true);
    await worker.launch();
    let result = await worker.postToQueue(task, taskId);
    await worker.terminate();
    assert.ok(abortedTask, 'task execution should have been aborted');
    assert.equal(result.run.reasonResolved, 'aborted', 'Task not marked as aborted');
  });
});
