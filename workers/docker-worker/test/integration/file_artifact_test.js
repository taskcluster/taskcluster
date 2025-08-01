const assert = require('assert');
const getArtifact = require('./helper/get_artifact');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const testworker = require('../post_task');
const TestWorker = require('../testworker');
const DockerWorker = require('../dockerworker');
const retryUtil = require('./helper/retry_util');
const { suiteName } = require('@taskcluster/lib-testing');
const helper = require('../helper');
const taskcluster = require('@taskcluster/client');
const got = require('got');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  test('extract artifact', async () => {
    let expiration = expires();
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'echo "xfoo" > /artifacts/xfoo.txt',
          'echo "bar" > /artifacts/bar.txt',
          'ls /artifacts',
        ),
        features: {
          localLiveLog: false,
        },
        artifacts: {
          'public/xfoo': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/xfoo.txt',
          },

          'public/bar': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/bar.txt',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    assert.deepEqual(
      Object.keys(result.artifacts).sort(), ['public/xfoo', 'public/bar'].sort(),
    );

    for (let artifact of Object.keys(result.artifacts || {})) {
      assert.equal(new Date(result.artifacts[artifact].expires).getTime(), expiration.getTime());
    }

    let xfoo = await getArtifact(result, 'public/xfoo');
    let bar = await getArtifact(result, 'public/bar');

    assert.equal(xfoo.trim(), 'xfoo');
    assert.equal(bar.trim(), 'bar');
  });

  test('extract txt compressed', async () => {
    let expiration = expires();
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'echo "xfoo" > /artifacts/xfoo.txt',
          'ls /artifacts',
        ),
        features: {
          localLiveLog: false,
        },
        artifacts: {
          'public/xfoo.txt': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/xfoo.txt',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    assert.deepEqual(
      Object.keys(result.artifacts).sort(), ['public/xfoo.txt'].sort(),
    );

    let xfoo = await getArtifact(result, 'public/xfoo.txt', { decompress: false });

    // Constant is gzips version of `xfoo\n', generated via
    // $ echo xfoo | gzip | od -t x1 -w30 | cut -d ' ' -f 2- --output-delimiter= --only-delimited
    assert.deepEqual(xfoo, Buffer.from('1f8b0800000000000003ab48cbcfe70200a7e6f65005000000', 'hex'));
  });

  test('extract dmg not compressed', async () => {
    let expiration = expires();
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'echo "xfoo" > /artifacts/xfoo.dmg',
          'ls /artifacts',
        ),
        features: {
          localLiveLog: false,
        },
        artifacts: {
          'public/xfoo.dmg': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/xfoo.dmg',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    assert.deepEqual(
      Object.keys(result.artifacts).sort(), ['public/xfoo.dmg'].sort(),
    );

    let xfoo = await getArtifact(result, 'public/xfoo.dmg', { decompress: false });

    assert.equal(xfoo.trim(), 'xfoo');
  });

  test('artifact expiration defaulted to task.expires', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'echo "xfoo" > /artifacts/xfoo.txt',
          'echo "bar" > /artifacts/bar.txt',
          'ls /artifacts',
        ),
        features: {
          localLiveLog: false,
        },
        artifacts: {
          'public/xfoo': {
            type: 'file',
            path: '/artifacts/xfoo.txt',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    assert.ok(Object.keys(result.artifacts).includes('public/xfoo'));
    assert.equal(result.status.expires, result.artifacts['public/xfoo'].expires);
  });

  test('upload 1mb artifact', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'dd if=/dev/zero of=/artifacts/test.html  bs=1  count=1000000',
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false,
        },
        artifacts: {
          'public/test.html': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/test.html',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok('public/test.html' in result.artifacts,
      'Artifact does not appear in the list of uploaded artifacts');

    assert.ok(result.artifacts['public/test.html'].contentType === 'text/html');

    let testContents = await getArtifact(result, 'public/test.html');
    assert.ok(Buffer.byteLength(testContents) === 1000000,
      'Size of uploaded contents does not match original.');
  });

  test('upload binary artifact', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'dd if=/dev/zero of=/artifacts/test  bs=1  count=200000',
          'tar -czvf artifacts.tar.gz /artifacts',
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false,
        },
        artifacts: {
          'public/test': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/test',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok('public/test' in result.artifacts,
      'Artifact does not appear in the list of uploaded artifacts');
    let contentType = 'application/octet-stream';
    assert.ok(result.artifacts['public/test'].contentType === contentType);
    // TODO handle response streams to validate content size
  });

  test('attempt to upload directory as file', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('ls'),
        artifacts: {
          'public/etc': {
            type: 'file',
            expires: expires(),
            path: '/etc/',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be unsuccessful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be unsuccessful');

    let errorMessage =
      'Error uploading "public/etc". Expected artifact to be a ' +
      '"file" but was "directory"';

    assert.ok(
      result.log.includes(errorMessage),
      'Error message does not appear in the logs',
    );

    assert.ok(result.artifacts['public/etc'], 'artifact is present when it shouldn\'t be');
    assert.equal(result.artifacts['public/etc'].storageType, 'error');
  });

  test('extract missing artifact', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "the user is:" > /username.txt',
          'whoami >> /username.txt',
          'echo "Okay, this is now done"',
        ),
        artifacts: {
          // Name -> Source
          'public/my-missing.txt': {
            type: 'file',
            path: '/this-file-is-missing.txt',
            expires: expires(),
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    let errorMessage = 'Artifact "public/my-missing.txt" not found at "/this-file-is-missing.txt"';
    assert.ok(
      result.log.includes(errorMessage),
      'Missing file was not noted in the logs',
    );

    assert.equal(result.run.state, 'completed', 'task should be unsuccessful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be unsuccessful');
    assert.ok(result.artifacts['public/my-missing.txt']);
    assert.equal(result.artifacts['public/my-missing.txt'].storageType, 'error');
  });

  test('both missing and found artifacts', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "the user is:" > /username.txt',
          'whoami >> /username.txt',
          'echo "Okay, this is now done"',
        ),
        artifacts: {
          // name -> source
          'public/username.txt': {
            type: 'file',
            path: 'username.txt',
            expires: expires(),
          },
          'public/passwd.txt': {
            type: 'file',
            path: '/etc/passwd',
            expires: expires(),
          },
          'public/my-missing.txt': {
            type: 'file',
            path: '/this-file-is-missing.txt',
            expires: expires(),
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results.
    assert.equal(result.run.state, 'completed', 'task should be unsuccessful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be unsuccessful');

    // Ensure these have no errors...
    assert.equal(result.artifacts['public/username.txt'].storageType, 's3');
    assert.equal(result.artifacts['public/passwd.txt'].storageType, 's3');

    // Missing artifact should have an error...
    assert.equal(result.artifacts['public/my-missing.txt'].storageType, 'error');
  });

  // intermittent https://github.com/taskcluster/taskcluster/issues/2951
  test.skip('upload retry', async () => {
    await retryUtil.init();
    let retry = false;
    let blocked = false;

    // we try the test a few times because there is a small
    // chance of the test failing due to external factors
    // (aka race conditions due to the asynchronous nature of
    // nodejs)
    for (let i = 0; !retry && i < 10; ++i) {
      let worker = new TestWorker(DockerWorker);
      await worker.launch();

      worker.once('Uploading public/xfoo', function() {
        if (!blocked) {
          retryUtil.blockArtifact();
          blocked = true;
        }
      });

      worker.on('retrying artifact upload', function() {
        retryUtil.allowArtifact();
        blocked = false;
        retry = true;
      });

      let result = await worker.postToQueue({
        payload: {
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'mkdir /artifacts/',
            'echo "xfoo" > /artifacts/xfoo.txt',
            'ls /artifacts',
          ),
          features: {
            localLiveLog: false,
          },
          artifacts: {
            'public/xfoo': {
              type: 'file',
              expires: expires(),
              path: '/artifacts/xfoo.txt',
            },
          },
          maxRunTime: 5 * 60,
        },
      });

      if (blocked) {
        retryUtil.allowArtifact();
        blocked = false;
        continue;
      }

      // Get task specific results
      assert.equal(result.run.state, 'completed', 'task should be successful');
      assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

      assert.deepEqual(
        Object.keys(result.artifacts).sort(), ['public/xfoo'].sort(),
      );

      let xfoo = await getArtifact(result, 'public/xfoo');

      assert(xfoo, 'Error retrying artifact');
      assert.equal(xfoo.trim(), 'xfoo');
    }

    assert.ok(retry);
  });

  test('automatic gzip compression', async () => {
    let expiration = expires();
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'echo "hello" > /artifacts/hello.txt',
          'echo "world" > /artifacts/world.jpg',
          'ls /artifacts',
        ),
        features: {
          localLiveLog: false,
        },
        artifacts: {
          'public/hello.txt': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/hello.txt',
          },

          'public/world.jpg': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/world.jpg',
          },
        },
        maxRunTime: 5 * 60,
      },
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    // Check that the artifacts have the right content encoding set
    // The text file should have gzip content-encoding
    let queue = new taskcluster.Queue(helper.optionsFromCiCreds());
    let url = queue.buildUrl(queue.getArtifact, result.taskId, result.runId, 'public/hello.txt');
    let resp = await got(url, { retry: 5 });
    assert.ok(resp.headers['content-encoding'] === 'gzip', `headers are: ${JSON.stringify(resp.headers)}`);

    // The jpg file should have no encoding
    url = queue.buildUrl(queue.getArtifact, result.taskId, result.runId, 'public/world.jpg');
    resp = await got(url, { retry: 5 });
    assert.ok(! ('content-encoding' in resp.headers), `headers are: ${JSON.stringify(resp.headers)}`);
  });
});
