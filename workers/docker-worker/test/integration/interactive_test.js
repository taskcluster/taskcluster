import assert from 'assert';
import base from 'taskcluster-base';
import cmd from './helper/cmd';
import crypto from 'crypto';
import Debug from 'debug';
import {DockerExecClient} from 'docker-exec-websocket-server';
import DockerWorker from '../dockerworker';
import https from 'https';
import TestWorker from '../testworker';
import Promise from 'promise';
import * as settings from '../settings';
import slugid from 'slugid';

suite('use docker exec websocket server', () => {
  let debug = Debug('docker-worker:test:interactive-test');

  let worker;
  // If taskcluster/artifact upload is under high load, this number needs to be adjusted up.
  // It also causes the test to be slower by 2X that many seconds, so be careful with this.
  // TODO: add polling to tests so they don't rely as much on this type of timing
  let minTime = 90;
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
      if (res.statusCode === 303) {
        return res.headers.location;
      } else {
        throw new Error('Error with code ' + res.statusCode + ' : ' + res.statusMessage);
      }
    };
    let signedUrl = queue.buildSignedUrl(
      queue.getLatestArtifact,
      taskId,
      'private/docker-worker-tests/interactive.sock',
      {expiration: 60 * 5});

    let url;
    await base.testing.poll(async () => {
      url = await getWithoutRedirect(signedUrl);
    }, 45, 1000);
    return url;
  }

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
    //should be dead here
    let dead = true;
    let failClient = new DockerExecClient({
      tty: false,
      command: ['echo'],
      url: url,
      wsopts: {rejectUnauthorized: false}
    });
    failClient.on('resumed', () => {
      dead = false;
    });
    await failClient.execute();
    await base.testing.sleep(3000);

    assert(dead, 'interactive session still available when it should have expired');
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
    worker.postToQueue(task, taskId);

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
    assert(status.status.state === 'running', 'stopped early!');
    

    client.close();
    await base.testing.sleep(expTime * 1000 + 3000);
    //should be dead here
    status = await worker.queue.status(taskId);
    assert(status.status.state === 'completed', 'hanging after client closed');

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
    client.stdout.on('data', (message) => {
      //checks each byte then increments the pointer
      for(let i = 0; i < message.length; i++) {
        if(message[i] !== buf[pointer++])
          throw new Error('byte at messages ' + i + ' which is ' + message[i]
            + ' of message total len ' + message.length +
            '\ndoes not match bufs ' + pointer - 1);
      }
      if (pointer === TEST_BUF_SIZE) {
        passed = true;
        debug('test finished!');
        client.close();
      }
    });

    await new Promise(accept => client.socket.once('close', accept));
    assert(passed,'only ' + pointer + ' bytes recieved');
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
    assert(/\[taskcluster\] Error: Task was aborted because states could not be started/
      .test(res.log));
  });
});
