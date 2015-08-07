import assert from 'assert';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

suite('use dind-service', () => {
  let worker;
  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  });

  test('run docker in docker', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/dind-test:v1',
        command: [
          'docker', 'run', '--rm', 'busybox:buildroot-2014.02',
          'busybox', '--help'
        ],
        features: {
          dind: true
        },
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed',
                 'task should be successful');
    assert.ok(result.log.indexOf('BusyBox is a multi-call binary') !== -1,
              'Expected to see busybox --help message');
  });
});

