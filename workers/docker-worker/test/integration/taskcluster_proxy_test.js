const assert = require('assert');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  let worker;
  setup(async () => {
    if (skipping()) {
      return;
    }
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    await worker.terminate();
  });

  test('issue a request to taskcluster via the proxy', async () => {
    let payload = {
      storageType: 'reference',
      expires: expires().toJSON(),
      contentType: 'text/html',
      url: 'https://mozilla.com',
    };

    let result = await worker.postToQueue({
      scopes: ['queue:create-artifact:custom'],
      payload: {
        image: 'centos:latest',
        features: {taskclusterProxy: true},
        artifacts: {},
        command: cmd(
          'curl --retry 5 -X POST ' +
          '-H "Content-Type: application/json" ' +
          '--data \'' + JSON.stringify(payload) + '\' ' +
          'taskcluster/queue/v1/task/$TASK_ID/runs/$RUN_ID/artifacts/custom',
        ),
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(result.artifacts.custom, 'custom artifact is available');
    assert.equal(result.artifacts.custom.storageType, 'reference');
  });
});
