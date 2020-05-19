const assert = require('assert');
const cmd = require('./helper/cmd');
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
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    await worker.terminate();
  });

  test('issue a request with a non supported feature', async () => {
    let result = await worker.postToQueue({
      scopes: ['queue:create-artifact:custom'],
      payload: {
        image: 'centos:latest',
        features: {invalidFeature: true},
        artifacts: {},
        command: cmd('sleep 5'),
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(result.run.state, 'failed', 'task should fail');
    assert.equal(result.run.reasonResolved, 'failed', 'task should fail');
  });
});
