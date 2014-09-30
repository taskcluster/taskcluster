suite('artifact extration tests', function() {
  var co = require('co');
  var getArtifact = require('./helper/get_artifact');
  var cmd = require('./helper/cmd');
  var expires = require('./helper/expires');
  var testworker = require('../post_task');

  test('extract artifact', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir /artifacts/',
          'echo "xfoo" > /artifacts/xfoo.txt',
          'echo "bar" > /artifacts/bar.txt',
          'ls /artifacts'
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
        },
        artifacts: {
          'public/xfoo': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/xfoo.txt',
          },

          'public/bar': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/bar.txt',
          }
        },
        maxRunTime:         5 * 60
      }
    });

    // Get task specific results
    assert.ok(result.run.success, 'task was successful');

    assert.deepEqual(
      Object.keys(result.artifacts).sort(), ['public/xfoo', 'public/bar'].sort()
    );

    var bodies = yield {
      xfoo: getArtifact(result, 'public/xfoo'),
      bar: getArtifact(result, 'public/bar')
    };

    assert.equal(bodies.xfoo.trim(), 'xfoo');
    assert.equal(bodies.bar.trim(), 'bar');
  }));

  test('upload 1mb artifact', co(function* () {
    var result = yield testworker({
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
            path: '/artifacts/test.html',
          }
        },
        maxRunTime:         5 * 60
      }
    });

    // Get task specific results
    assert.ok(result.run.success, 'task was successful');
    assert.ok('public/test.html' in result.artifacts,
              'Artifact does not appear in the list of uploaded artifacts');

    assert.ok(result.artifacts['public/test.html'].contentType === 'text/html');

    var testContents = yield getArtifact(result, 'public/test.html');
    assert.ok(Buffer.byteLength(testContents) === 1000000,
              'Size of uploaded contents does not match original.');
  }));

  test('upload binary artifact', co(function* () {
    var result = yield testworker({
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
            path: '/artifacts/test',
          }
        },
        maxRunTime:         5 * 60
      }
    });

    // Get task specific results
    assert.ok(result.run.success, 'task was successful');
    assert.ok('public/test' in result.artifacts,
              'Artifact does not appear in the list of uploaded artifacts');
    var contentType = 'application/octet-stream';
    assert.ok(result.artifacts['public/test'].contentType === contentType);
    // TODO handle response streams to validate content size

  }));

  test('attempt to upload directory as file', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('ls'),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
        },
        artifacts: {
          'public/etc': {
            type: 'file',
            expires: expires(),
            path: '/etc/',
          }
        },
        maxRunTime:         5 * 60
      }
    });

    // Get task specific results
    assert.ok(result.run.success, 'task was successful');
    assert.ok(result.artifacts['public/etc'], 'artifact is present');
    assert.equal(result.artifacts['public/etc'].storageType, 'error');
  }));

  test('extract missing artifact', co(function*() {
    var result = yield testworker({
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
            path: 'this-file-is-missing.txt',
            expires: expires()
          }
        },
        maxRunTime:         5 * 60
      }
    });

    assert.ok(
      result.log.indexOf('"this-file-is-missing.txt"') !== -1,
      'Missing path is noted in the logs'
    );

    assert.ok(result.run.success, 'task was successful');
    assert.ok(result.artifacts['my-missing.txt']);
    assert.equal(result.artifacts['my-missing.txt'].storageType, 'error');
  }));

  test('both missing and found artifacts', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "the user is:" > /username.txt',
          'whoami >> /username.txt',
          'echo "Okay, this is now done"'
        ),
        features: {
          bufferLog: true,
          azureLivelog: false,
          extractArtifacts: true,
          localLiveLog: false
        },
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
        maxRunTime:         5 * 60
      }
    });
    // Get task specific results.
    assert.ok(result.run.success, 'task was successful');

    // Ensure these have no errors...
    assert.equal(result.artifacts['username.txt'].storageType, 's3');
    assert.equal(result.artifacts['passwd.txt'].storageType, 's3');

    // Missing artifact should have an error...
    assert.equal(result.artifacts['my-missing.txt'].storageType, 'error');
  }));
});
