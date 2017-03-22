import assert from 'assert';
import base from 'taskcluster-base'
import Docker from 'dockerode-promise';
import dockerOpts from 'dockerode-options';
import DockerWorker from '../dockerworker';
import fs from 'mz/fs';
import https from 'https';
import request from 'superagent-promise';
import * as settings from '../settings';
import tar from 'tar-fs';
import TestWorker from '../testworker';
import waitForEvent from '../../build/lib/wait_for_event';
import Debug from 'debug';

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
