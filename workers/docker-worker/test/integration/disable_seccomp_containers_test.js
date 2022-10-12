const assert = require('assert');
const settings = require('../settings');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('disableSeccomp capability', () => {
  let worker;

  setup(async () => {
    settings.cleanup();
  });

  teardown(async () => {
    settings.cleanup();
    if (worker) {
      await worker.terminate();
    }
    worker = null;
  });

  test('task error when necessary scopes missing', async () => {
    settings.configure({
      dockerConfig: {
        allowDisableSeccomp: true,
      },
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'sleep 1',
        ],
        capabilities: {
          disableSeccomp: true,
        },
        maxRunTime: 5 * 60,
      },
    });

    let errorMessage = 'Insufficient scopes to run task without seccomp';
    assert.ok(result.log.indexOf(errorMessage) !== -1);
    assert.equal(result.run.state, 'failed', 'task should not be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should not be successful');
  });

  test('task error when disableSeccomp requested but not enabled in worker', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      scopes: ['docker-worker:capability:disableSeccomp'],
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'sleep 1',
        ],
        capabilities: {
          disableSeccomp: true,
        },
        maxRunTime: 5 * 60,
      },
    });

    let errorMessage = 'Error: Cannot run task using docker without a seccomp profile';
    assert.ok(result.log.indexOf(errorMessage) !== -1);
    assert.equal(result.run.state, 'failed', 'task should not be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should not be successful');
  });

  test('use performance counter in a container without disableSeccomp -- task should fail', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      payload: {
        image: 'alpine',
        command: ['/bin/sh', '-c', 'apk add perf; perf stat ls'],
        maxRunTime: 5 * 60,
      },
    });

    assert(result.run.state === 'failed', 'task should fail');
    assert(result.run.reasonResolved === 'failed', 'task should fail');
  });

  test('use performance counter in a container with disableSeccomp -- task should succeed', async () => {
    settings.configure({
      dockerConfig: {
        allowDisableSeccomp: true,
      },
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      scopes: ['docker-worker:capability:disableSeccomp'],
      payload: {
        image: 'alpine',
        command: ['/bin/sh', '-c', 'apk add perf; perf stat ls'],
        capabilities: {
          disableSeccomp: true,
        },
        maxRunTime: 5 * 60,
      },
    });

    assert(result.run.state === 'completed', 'task should not fail');
    assert(result.run.reasonResolved === 'completed', 'task should not fail');
  });
});
