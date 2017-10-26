const https = require('https');
const slugid = require('slugid');
const url = require('url');

const DockerWorker = require('../../dockerworker');
const settings = require('../../settings');
const TestWorker = require('../../testworker');
const waitForEvent = require('../../../src/lib/wait_for_event');

suite('secure local live logging', () => {
  let worker;

  setup(() => {
    settings.cleanup();
  });

  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }

    settings.cleanup();
  });

  async function getWithoutRedirect (url) {
    let res = await new Promise((resolve, reject) => {
      https.request(url, (r) => {
        resolve(r);
      }).end();
    });
    return res;
  };

  test('ssl enabled', async () => {
    settings.configure({
      logging: {
        secureLiveLogging: true,
        liveLogExpires: '1 hour',
        bulkLogExpires: '1 hour'
      }
    });

    let taskId = slugid.v4();
    var task = {
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

    worker = new TestWorker(DockerWorker);
    await worker.launch();

    worker.postToQueue(task, taskId);
    await waitForEvent(worker, 'task run');

    let artifactUrl = `https:\/\/queue.taskcluster.net/v1/task/${taskId}/runs/0/artifacts/public/logs/live.log`;

    // Don't follow redirect, we just care about where it's going
    let res = await getWithoutRedirect(artifactUrl);
    let logUrl = res.headers.location;

    assert.equal(
      url.parse(logUrl).protocol,
      'https:',
      'Live log is not served over https'
    );
  });

  test('ssl disabled by default', async () => {
    settings.configure({
      ssl: {
        certificate: '/some/path/ssl.cert',
        key: '/some/path/ssl.key'
      }
    });

    let taskId = slugid.v4();
    var task = {
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

    worker = new TestWorker(DockerWorker);
    await worker.launch();

    worker.postToQueue(task, taskId);
    await waitForEvent(worker, 'task run');

    let artifactUrl = `https:\/\/queue.taskcluster.net/v1/task/${taskId}/runs/0/artifacts/public/logs/live.log`

    // Don't follow redirect, we just care about where it's going
    let res = await getWithoutRedirect(artifactUrl);
    let logUrl = res.headers.location;

    assert.equal(
      url.parse(logUrl).protocol,
      'http:',
      'Live log should not be served over https'
    );

  });

  test('tasks not claimed when secure logging enabled and missing certs', async () => {
    settings.billingCycleInterval(20);
    settings.configure({
      logging: {
        secureLiveLogging: true,
        liveLogExpires: 3600,
        bulkLogExpires: 3600
      },
      shutdown: {
        enabled: true,
        minimumCycleSeconds: 2 // always wait 2 seconds before shutdown...
      },
      ssl: {
        certificate: '/some/path/ssl.cert',
        key: '/some/path/ssl.key'
      }
    });

    let taskId = slugid.v4();
    var task = {
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

    worker = new TestWorker(DockerWorker);

    let claimedTask = false;
    worker.on('claim task', () => claimedTask = true);

    worker.launch();
    await waitForEvent(worker, '[alert-operator] ssl certificate error');

    worker.postToQueue(task, taskId);

    await waitForEvent(worker, 'shutdown');

    assert.ok(!claimedTask, 'Task should not have been claimed');
  });
});
