import assert from 'assert';
import getArtifact from './helper/get_artifact';
import cmd from './helper/cmd';
import expires from './helper/expires';
import testworker from '../post_task';

suite('artifact extration tests', () => {
  test('extract artifact', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'echo "xfoo" > /artifacts/xfoo.txt',
          'echo "bar" > /artifacts/bar.txt',
          'ls /artifacts'
        ),
        features: {
          localLiveLog: false
        },
        artifacts: {
          'public/xfoo': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/xfoo.txt'
          },

          'public/bar': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/bar.txt'
          }
        },
        maxRunTime: 5 * 60
      }
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');

    assert.deepEqual(
      Object.keys(result.artifacts).sort(), ['public/xfoo', 'public/bar'].sort()
    );

    let xfoo = await getArtifact(result, 'public/xfoo');
    let bar = await getArtifact(result, 'public/bar');

    assert.equal(xfoo.trim(), 'xfoo');
    assert.equal(bar.trim(), 'bar');
  });

  test('upload 1mb artifact', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'dd if=/dev/zero of=/artifacts/test.html  bs=1  count=1000000'
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
        },
        artifacts: {
          'public/test.html': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/test.html'
          }
        },
        maxRunTime: 5 * 60
      }
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
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
          'tar -czvf artifacts.tar.gz /artifacts'
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
        },
        artifacts: {
          'public/test': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/test'
          }
        },
        maxRunTime: 5 * 60
      }
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
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
            path: '/etc/'
          }
        },
        maxRunTime: 5 * 60
      }
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be unsuccessfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be unsuccessfull');

    let errorMessage =
      'Error uploading "public/etc". Expected artifact to be a ' +
      '"file" but was "directory"';

    assert.ok(
      result.log.includes(errorMessage),
      'Error message does not appear in the logs'
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
          'echo "Okay, this is now done"'
        ),
        artifacts: {
          // Name -> Source
          'my-missing.txt': {
            type: 'file',
            path: '/this-file-is-missing.txt',
            expires: expires()
          }
        },
        maxRunTime: 5 * 60
      }
    });

    let errorMessage = 'Artifact "my-missing.txt" not found at "/this-file-is-missing.txt"';
    assert.ok(
      result.log.includes(errorMessage),
      'Missing file was not noted in the logs'
    );

    assert.equal(result.run.state, 'completed', 'task should be unsuccessfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be unsuccessfull');
    assert.ok(result.artifacts['my-missing.txt']);
    assert.equal(result.artifacts['my-missing.txt'].storageType, 'error');
  });

  test('both missing and found artifacts', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "the user is:" > /username.txt',
          'whoami >> /username.txt',
          'echo "Okay, this is now done"'
        ),
        artifacts: {
          // name -> source
          'username.txt': {
            type: 'file',
            path: 'username.txt',
            expires: expires()
          },
          'passwd.txt': {
            type: 'file',
            path: '/etc/passwd',
            expires: expires()
          },
          'my-missing.txt': {
            type: 'file',
            path: '/this-file-is-missing.txt',
            expires: expires()
          }
        },
        maxRunTime: 5 * 60
      }
    });

    // Get task specific results.
    assert.equal(result.run.state, 'completed', 'task should be unsuccessfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be unsuccessfull');

    // Ensure these have no errors...
    assert.equal(result.artifacts['username.txt'].storageType, 's3');
    assert.equal(result.artifacts['passwd.txt'].storageType, 's3');

    // Missing artifact should have an error...
    assert.equal(result.artifacts['my-missing.txt'].storageType, 'error');
  });
});
