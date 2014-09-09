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

  test('attempt to upload directory as file', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('ls'),
        features: {
          // No need to actually issue live logging...
          liveLog: false
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
    assert.ok(result.artifacts['my-missing.txt'])
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
          extractArtifacts: true
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
