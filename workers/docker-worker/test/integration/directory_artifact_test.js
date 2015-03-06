suite('Directory artifact', function() {
  var co = require('co');
  var testworker = require('../post_task');
  var getArtifact = require('./helper/get_artifact');
  var cmd = require('./helper/cmd');
  var expires = require('./helper/expires');

  test('attempt to upload file as directory', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd('echo "xfoo" > /xfoo.txt'),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
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
    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
    assert.ok(result.artifacts['public/xfoo'], 'artifact is present');
    assert.equal(result.artifacts['public/xfoo'].storageType, 'error');
  }));

  test('upload an entire directory', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'mkdir -p "/xfoo/wow"',
          'echo "xfoo" > /xfoo/wow/bar.txt',
          'echo "text" > /xfoo/wow/another.txt',
          'dd if=/dev/zero of=/xfoo/test.html  bs=1  count=1000000'
        ),
        features: {
          localLiveLog: false
        },
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

    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');

    assert.deepEqual(
      Object.keys(result.artifacts).sort(),
      [
        'public/dir/test.html',
        'public/dir/wow/bar.txt',
        'public/dir/wow/another.txt'
      ].sort()
    );

    var bodies = yield {
      bar: getArtifact(result, 'public/dir/wow/bar.txt'),
      another: getArtifact(result, 'public/dir/wow/another.txt'),
    };

    assert.deepEqual(bodies, {
      bar: 'xfoo\n',
      another: 'text\n'
    });

    var testHtml = yield getArtifact(result, 'public/dir/test.html');
    assert.ok(Buffer.byteLength(testHtml) === 1000000,
      'Size of uploaded contents of test.html does not match original.'
    );
  }));

});
