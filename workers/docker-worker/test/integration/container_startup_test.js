const assert = require('assert');

const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('container startup', () => {
  let worker;

  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    await worker.terminate();
  });

  test('caught failure - invalid command', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          'echo "Hello"'
        ],
        maxRunTime: 30
      }
    });

    assert.equal(result.run.state, 'failed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should be successful');
    assert.ok(
      result.log.includes('Failure to properly start execution environment'),
      'Error message was not written to the task log.'
    );
  });
});
