const assert = require('assert');
const testworker = require('../post_task');
const cmd = require('./helper/cmd');

suite('Header/Footer logs', () => {
  test('Unsuccessful task', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'exit 5'
        ),
        maxRunTime: 5 * 60
      }
    });

    let tcLogs = result.log.match(/\[taskcluster (.*)\](.*)/g);
    let start = tcLogs[0];
    let end = tcLogs[tcLogs.length-1];

    // ensure task id in in the start...
    assert.ok(start.indexOf(result.taskId) !== -1, 'start log has taskId');
    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(
      end.indexOf('Unsuccessful') !== -1, 'end has human readable failure'
    );
    assert.ok(end.indexOf('exit code: 5') !== -1, 'end has exit code');
  });

  test('header written to log', async () => {
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'exit 0'
        ),
        maxRunTime: 5 * 60
      }
    });

    let tcLogs = result.log.match(/\[taskcluster (.*)\](.*)/g);

    assert.ok(
      tcLogs[0].includes(`Task ID: ${result.taskId}`),
      `Log header does not include task id. Log Line: ${tcLogs[0]}`
    );
    assert.ok(
      tcLogs[1].includes(`Worker ID: ${result.run.workerId}`),
      `Log header does not include worker id. Log Line: ${tcLogs[1]}`
    );
    assert.ok(
      tcLogs[2].includes(`Worker Group: ${result.run.workerGroup}`),
      `Log header does not include worker group. Log Line: ${tcLogs[2]}`
    );
    assert.ok(
      tcLogs[3].includes('Worker Node Type: test-worker'),
      `Log header does not include worker node type. Log Line: ${tcLogs[3]}`
    );
    assert.ok(
      tcLogs[4].includes(`Worker Type: ${result.status.workerType}`),
      `Log header does not include worker type. Log Line: ${tcLogs[4]}`
    );
    assert.ok(
      tcLogs[5].includes('Public IP: 127.0.0.1'),
      `Log header does not include public IP. Log Line: ${tcLogs[5]}`
    );
  });
});
