const assert = require('assert');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const testworker = require('../post_task.js');

suite('features', () => {
  test('disabled feature', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/true',
        ],
        features: {
          bulkLog: true,
        },
        maxRunTime: 5 * 60,
      },
    }, undefined, {bulkLog: {enabled: false}});

    assert.equal(result.run.state, 'failed');
    assert.equal(result.run.reasonResolved, 'failed');

    // FIXME
    /*
    let errorMessage =
      'bulkLog is not enabled on this worker';

    assert.ok(
      result.log.includes(errorMessage),
      'Error message does not appear in the logs',
    );
    */
  });

  test('disabled feature defaults', async () => {
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
          // No need to actually issue live logging...
          localLiveLog: false,
        },
        artifacts: {
          'public': {
            type: 'directory',
            expires: expires(),
            path: '/artifacts',
          },
        },
        maxRunTime: 5 * 60,
      },
    }, undefined, {artifacts: {enabled: false}});

    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');

    assert.deepEqual(
      Object.keys(result.artifacts), [], 'should not have uploaded artifacts',
    );
  });
});
