import assert from 'assert';
import testworker from '../post_task';
import getArtifact from './helper/get_artifact';
import cmd from './helper/cmd';
import expires from './helper/expires';

suite('Directory artifact', () => {
  test('attempt to upload file as directory', async () => {
    let result = await testworker({
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
    assert.equal(result.run.state, 'completed', 'task should be unsuccessfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be unsuccessfull');
    assert.ok(result.artifacts['public/xfoo'], 'artifact should not be present');
    assert.equal(result.artifacts['public/xfoo'].storageType, 'error');
  });

  test('upload an entire directory', async () => {
    let result = await testworker({
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

    let bar = await getArtifact(result, 'public/dir/wow/bar.txt');
    let another = await getArtifact(result, 'public/dir/wow/another.txt');

    assert.equal(bar, 'xfoo\n');
    assert.equal(another, 'text\n');

    let testHtml = await getArtifact(result, 'public/dir/test.html');
    assert.ok(Buffer.byteLength(testHtml) === 1000000,
      'Size of uploaded contents of test.html does not match original.'
    );
  });
});
