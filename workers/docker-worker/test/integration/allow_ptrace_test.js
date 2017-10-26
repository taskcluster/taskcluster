const assert = require('assert');
const base  = require('taskcluster-base');
const Docker = require('dockerode-promise');
const dockerOpts = require('dockerode-options');
const DockerWorker = require('../dockerworker');
const fs = require('mz/fs');
const https = require('https');
const request = require('superagent-promise');
const settings = require('../settings');
const tar = require('tar-fs');
const TestWorker = require('../testworker');
const waitForEvent = require('../../src/lib/wait_for_event');
const Debug = require('debug');

let debug = Debug('docker-worker:test:allow-ptrace-test');

suite.skip('allowPtrace feature', () => {
  let worker;
  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  });

  test('use ptrace in a container without allowPtrace -- task should fail', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'busybox',
        command: ['/bin/sh', '-c', 'od -x /proc/$$/auxv'],
        maxRunTime: 1 * 60
      }
    });

    assert(result.run.state === 'failed', 'task should fail');
    assert(result.run.reasonResolved === 'failed', 'task should fail');
  });

  test('use ptrace in a container with allowPtrace -- task should succeed', async () => {
    let result = await worker.postToQueue({
      scopes: [
        'docker-worker:feature:allowPtrace',
      ],
      payload: {
        image: 'busybox',
        command: ['/bin/sh', '-c', 'od -x /proc/$$/auxv'],
        features: {
          allowPtrace: true,
        },
        maxRunTime: 1 * 60
      }
    });

    debug(result.run);
    assert(result.run.state === 'completed', 'task should not fail');
    assert(result.run.reasonResolved === 'completed', 'task should not fail');
  });
});
