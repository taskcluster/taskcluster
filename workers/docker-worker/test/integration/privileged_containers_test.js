const assert = require('assert');
const settings = require('../settings');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

let worker;

suite('Privileged containers', () => {

  setup(() => {
    settings.cleanup();
  });

  teardown(async () => {
    settings.cleanup();
    if (worker) await worker.terminate();
    worker = null;
  });

  test('task error when necessary scopes missing', async () => {
    settings.configure({
      dockerConfig: {
        allowPrivileged: true
      }
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'sleep 1'
        ],
        capabilities: {
          privileged: true
        },
        maxRunTime: 5 * 60
      }
    });

    let errorMessage = 'Insufficient scopes to run task in privileged mode';
    assert.ok(result.log.indexOf(errorMessage) !== -1);
    assert.equal(result.run.state, 'failed', 'task should not be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should not be successful');
  });

  test('task error when privileged requested but not enabled in worker', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      scopes: ["docker-worker:capability:privileged"],
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'sleep 1'
        ],
        capabilities: {
          privileged: true
        },
        maxRunTime: 5 * 60
      }
    });

    let errorMessage = 'Error: Cannot run task using docker privileged mode';
    assert.ok(result.log.indexOf(errorMessage) !== -1);
    assert.equal(result.run.state, 'failed', 'task should not be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should not be successful');
  });

  test('allow task to run in privileged mode', async () => {
    settings.configure({
      dockerConfig: {
        allowPrivileged: true
      }
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      scopes: ["docker-worker:capability:privileged"],
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'mount -n -t tmpfs -o uid=0,gid=0,mode=0755 cgroup /sys/fs/cgroup'
        ],
        capabilities: {
          privileged: true
        },
        maxRunTime: 5 * 60
      }
    });

    console.log(result.log);
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
  });

  test('task cannot run privileged commands if privileged mode disabled', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue({
      scopes: ["docker-worker:capability:privileged"],
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'mount -n -t tmpfs -o uid=0,gid=0,mode=0755 cgroup /sys/fs/cgroup'
        ],
        maxRunTime: 5 * 60
      }
    });

    assert.ok(
      result.log.includes('mount: permission denied') ||
      result.log.includes('mount: cannot mount block device'),
      `Mount denied message did not appear in the log. Message: ${result.log}`
    );
    assert.equal(result.run.state, 'failed', 'task should not be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should not be successful');
  });
});
