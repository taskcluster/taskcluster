import request from 'superagent-promise';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';

import cmd from '../helper/cmd';
import DockerWorker from '../../dockerworker';
import TestWorker from '../../testworker';
import waitForEvent from '../../../lib/wait_for_event';

suite('live logging', () => {
  let worker;

  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    await worker.terminate();
  });

  test('live logging of content', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'echo "first command!"; ' +
          'for i in {1..1000}; do echo "Hello Number $i"; done;'
        ],
        maxRunTime: 5 * 60
      }
    });

    // Expected junk in the log.
    let log = '';
    for (let i = 1; i <= 1000; i++) {
      log += 'Hello Number ' + i + '\r\n';
    }

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(result.log.includes(log), 'contains each expected line');
  });

  test('live log url contains access token', async () => {
    let taskId = slugid.v4();
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command:        [
          '/bin/bash',
          '-c',
          'echo "first command!"; ' +
          'for i in {1..3}; do echo "Hello Number $i" && sleep 1; done;'
        ],
        maxRunTime: 3 * 60
      }
    };

    worker.postToQueue(task, taskId);
    await waitForEvent(worker, 'task run');

    let artifactUrl = `https:\/\/queue.taskcluster.net/v1/task/${taskId}/runs/0/artifacts/public/logs/live.log`

    // Don't follow redirect, we just care about where it's going
    let req = request.get(artifactUrl);
    let logUrl;
    req.on('redirect', res => logUrl = res.headers.location)
    let res = await req.end();
    let token = /^http:\/\/localhost:[0-9]+\/log\/([a-zA-Z0-9_-]+)$/.exec(logUrl);
    token = token ? token[1] : '';

    assert.equal(
      token.length,
      22, 'Token should be 22 characters long'
    );
  });

  test('live log expiration date', async () => {
    let expiration = taskcluster.fromNowJSON('30 minutes');
    let result = await worker.postToQueue({
      expires: expiration,
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'echo "first command!"'
        ],
        maxRunTime: 3 * 60
      }
    });
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert(result.artifacts['public/logs/live.log'].expires === expiration,
      'expiration date of live log improperly set');
  });
});
