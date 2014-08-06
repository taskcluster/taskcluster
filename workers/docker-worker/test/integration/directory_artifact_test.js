suite('Directory artifact', function() {
  var co = require('co');
  var testworker = require('../post_task');
  var getArtifact = require('./helper/get_artifact');
  var cmd = require('./helper/cmd');
  var expires = require('./helper/expires');

  test('attempt to upload file as directory', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'ubuntu',
        command: cmd('echo "xfoo" > /xfoo.txt'),
        features: {
          // No need to actually issue live logging...
          liveLog: false
        },
        artifacts: {
          'public/xfoo': {
            type: 'directory',
            expires: expires(),
            path: '/xfoo.txt'
          }
        },
        maxRunTime: 5 * 60
      }
    });

    // Get task specific results
    assert.ok(result.run.success, 'task was successful');
    assert.ok(result.artifacts['public/xfoo'], 'artifact is present');
    assert.equal(result.artifacts['public/xfoo'].storageType, 'error');
  }));

  test('upload an entire directory', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'ubuntu',
        command: cmd(
          'mkdir -p "/xfoo/wow"',
          'echo "xfoo" > /xfoo/wow/bar.txt',
          'echo "text" > /xfoo/wow/another.txt'
        ),
        features: {},
        artifacts: {
          'public/dir': {
            type: 'directory',
            path: '/xfoo/',
            expires: expires()
          },
        },
        maxRunTime: 5 * 60
      }
    });

    assert.ok(result.run.success, 'task was successful');
    assert.ok(result.artifacts['public/dir/wow/bar.txt'], 'creates artifact');
    assert.ok(
      result.artifacts['public/dir/wow/another.txt'], 'creates artifact'
    );

    var bodies = yield {
      bar: getArtifact(result, 'public/dir/wow/bar.txt'),
      another: getArtifact(result, 'public/dir/wow/another.txt')
    }

    assert.deepEqual(bodies, {
      bar: 'xfoo\n',
      another: 'text\n'
    });
  }));

});
