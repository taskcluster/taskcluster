import settings from '../settings';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

const IMAGE = 'gregarndt/taskcluster-balrog-mock:0.0.1';

let worker;

suite('balrog vpn proxy', () => {
  setup(async () => {
    settings.configure({
      balrogVPNProxyImage: IMAGE
    });
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    settings.cleanup();
    await worker.terminate();
  });

  test('feature can be used within task', async () => {
    let error;
    worker.on('task aborted', (message) => {
      error = message.err
    });

    let result = await worker.postToQueue({
      scopes: ["docker-worker:feature:balrogVPNProxy"],
      payload: {
        features: {
          balrogVPNProxy: true
        },
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'ping -c1 balrog'
        ],
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.status.state, 'completed', 'Task not marked as failed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
    assert.ok(result.log.indexOf("1 received", "Proxy could not be reached"));
  });

  test('missing feature scope', async () => {
    let error;
    worker.on('task aborted', (message) => {
      error = message.err
    });

    let result = await worker.postToQueue({
      payload: {
        features: {
          balrogVPNProxy: true
        },
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'ls'
        ],
        maxRunTime: 5 * 60
      }
    });

    // Need to rely on looking at the logging from the worker because the logserve
    // container might not have created a logging artifact in time because of where
    // this check takes place.
    assert.ok(
      error.indexOf('Insufficient scopes to use') !== -1,
      'Error does not contain correct message'
    );

    assert.equal(result.status.state, 'failed', 'Task not marked as failed');
  });

});
