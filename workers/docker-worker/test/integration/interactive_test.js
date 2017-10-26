const assert = require('assert');
const base = require('taskcluster-base');
const cmd = require('./helper/cmd');
const crypto = require('crypto');
const Debug = require('debug');
const {DockerExecClient} = require('docker-exec-websocket-server');
const DockerWorker = require('../dockerworker');
const https = require('https');
const TestWorker = require('../testworker');
const Promise = require('promise');
const settings = require('../settings');
const slugid = require('slugid');
const URL = require('url');

suite('use docker exec websocket server', () => {
  let debug = Debug('docker-worker:test:interactive');

  let worker;
  // If taskcluster/artifact upload is under high load, this number needs to
  // be adjusted up. It also causes the test to be slower by 2X that many
  // seconds, so be careful with this.
  let minTime = 30;
  let expTime = 10;
  setup(async () => {
    settings.cleanup();
    settings.configure({
      interactive: {
        ssl: true,
        minTime: minTime,
        expirationAfterSession: expTime
      }
    });
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    settings.cleanup();
  });

  async function getArtifact (queue, taskId) {
    async function getWithoutRedirect (url) {
      let res = await new Promise((resolve, reject) => {
        https.request(url, (res) => {
          resolve(res);
        }).end();
      });
      assert.equal(res.statusCode, 303);
      return URL.parse(res.headers.location, true).query.socketUrl;
    };
    let signedUrl = queue.buildSignedUrl(
      queue.getLatestArtifact,
      taskId,
      'private/docker-worker-tests/shell.html',
      {expiration: 60 * 5});

    return base.testing.poll(() => getWithoutRedirect(signedUrl), 45, 1000);
  };

  test('cat', async () => {
    let taskId = slugid.v4();
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('sleep 50'),
        maxRunTime: 4 * 60,
        features: {
          interactive: true
        }
      }
    };
    debug('posting to queue');
    worker.postToQueue(task, taskId).catch((err) => {debug(err); debug('Error');});
    debug('posted to queue');

    let passed = false;

    let url = await getArtifact(worker.queue, taskId);

    //for testing, we don't care about https verification
    let client = new DockerExecClient({
      tty: false,
      command: ['cat'],
      url: url,
      wsopts: {rejectUnauthorized: false}
    });
    await client.execute();

    client.stderr.on('data', (message) => {
      debug(message.toString());
    })
    client.stdout.on('data', (message) => {
      debug(message.toString());
    });

    let buf = new Buffer([0xfa, 0xff, 0x0a]);
    client.stdin.write(buf);
    //message is small enough that it should be returned in one chunk
    client.stdout.on('data', (message) => {
      assert(buf[0] === message[0], 'message wrong!');
      assert(buf[1] === message[1], 'message wrong!');
      assert(buf[2] === message[2], 'message wrong!');
      passed = true;
      debug('test finished!');
      client.close();
    });

    await new Promise(accept => client.socket.once('close', accept));
    assert(passed,'message not recieved');
  });

  test('expires', async () => {
    let taskId = slugid.v4();
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('sleep 1'),
        maxRunTime: 4 * 60,
        features: {
          interactive: true
        }
      }
    };
    debug('posting to queue');
    worker.postToQueue(task, taskId);

    let url = await getArtifact(worker.queue, taskId);

    let client = new DockerExecClient({
      tty: false,
      command: ['pwd'],
      url: url,
      wsopts: {rejectUnauthorized: false}
    });
    let connected = false;

    //check for proper connection
    //should still be alive here
    await client.execute();
    client.stdout.on('data', (message) => {
      assert(message[0] === 0x2f); // is a slash, as expected of pwd
      connected = true;
      client.close();
    });

    await base.testing.sleep(minTime * 1000 + 10000);
    let failClient = new DockerExecClient({
      tty: false,
      command: ['echo'],
      url: url,
      wsopts: {rejectUnauthorized: false}
    });
    await failClient.execute().then(() => {
      assert(false, "Expected an error");
    }, err => {
      debug("Got error as expected: %s", err);
    });
    assert(connected, 'interactive session failed to connect');
  });

  test('stays alive', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();

    let taskId = slugid.v4();
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('echo hello'),
        maxRunTime: 4 * 60,
        features: {
          interactive: true
        }
      }
    };
    debug('posting to queue');
    const p = worker.postToQueue(task, taskId);

    let url = await getArtifact(worker.queue, taskId);

    let client = new DockerExecClient({
      tty: false,
      command: ['cat'],
      url: url,
      wsopts: {rejectUnauthorized: false}
    });
    let connected = false;

    //check for proper connection
    //should still be alive here
    await client.execute();
    client.stdin.write('a\n');
    client.stdout.on('data', (message) => {
      assert(message[0] === 0x61);
      assert(message[1] === 0x0a);
      connected = true;
    });

    await base.testing.sleep(minTime * 1000 + 1000);
    //should still be alive here, even though it was dead here last time
    //This is because cat is still alive
    let status = await worker.queue.status(taskId);
    assert.equal(status.status.state, 'running', 'stopped early!');
    
    client.close();

    const result = await p;
    assert.equal(result.run.state, 'completed', 'hanging after client closed');

    assert(connected, 'interactive session failed to connect');
  });

  test('cat stress test', async () => {
    let taskId = slugid.v4();
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('sleep 60'),
        maxRunTime: 4 * 60,
        features: {
          interactive: true
        }
      }
    };
    debug('posting to queue');
    worker.postToQueue(task, taskId);

    let passed = false;

    let url = await getArtifact(worker.queue, taskId);

    //for testing, we don't care about https verification
    let client = new DockerExecClient({
      tty: false,
      command: ['cat'],
      url: url,
      wsopts: {rejectUnauthorized: false}
    });
    await client.execute();

    const TEST_BUF_SIZE = 1024 * 1024;

    let buf = await Promise.denodeify(crypto.pseudoRandomBytes)(TEST_BUF_SIZE);
    let pointer = 0;
    client.stdin.write(buf);
    client.stdin.end();
    let buffers = [];
    client.stdout.on('data', d => buffers.push(d));
    await new Promise(accept => client.stdout.on('end', accept));
    let data = Buffer.concat(buffers);
    assert(data.compare(buf),'buffer mismatch');
  });

  test('started hook fails gracefully on crash', async () => {
    settings.configure({
      ssl: {
        certificate: '/some/path/ssl.cert',
        key: '/some/path/ssl.key'
      }
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();

    let taskId = slugid.v4();
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('sleep 60'),
        maxRunTime: 2 * 60,
        features: {
          interactive: true
        }
      }
    };
    debug('posting to queue');
    let res = await worker.postToQueue(task, taskId);
    debug(res.log);
    assert(/\[taskcluster:error\] Task was aborted because states could not be started/
      .test(res.log));
  });
});
