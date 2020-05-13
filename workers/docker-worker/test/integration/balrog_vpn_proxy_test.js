const assert = require('assert');
const settings = require('../settings');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

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
    let result = await worker.postToQueue({
      scopes: ['docker-worker:feature:balrogVPNProxy'],
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

    assert.equal(result.status.state, 'completed', 'Task not marked as completed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
    assert.ok(result.log.indexOf('1 received', 'Proxy could not be reached'));
  });

  test('missing feature scope', async () => {
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

    assert.ok(
      result.log.includes('[taskcluster:error] Task was aborted because states'),
      'Error does not container message about states being aborted'
    );

    assert.ok(
      result.log.includes('Error calling \'link\' for balrogVPNProxy'),
      'Error does not contain the name of the feature'
    );
    assert.ok(
      result.log.includes('Insufficient scopes to use \'balrogVPNProxy\''),
      'Error does not contain message about insufficient scopes'
    );

    assert.equal(result.status.state, 'failed', 'Task not marked as failed');
  });

});
