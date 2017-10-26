const assert = require('assert');
const getArtifact = require('./helper/get_artifact');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const waitTaskCompletion = require('./helper/wait_task_completion');
const TestWorker = require('../testworker');
const DockerWorker = require('../dockerworker');
const iptables = require('iptables');
const slugid = require('slugid');
const _ = require('lodash');
const mime = require('mime');
const debug = require('debug')('docker-worker:test:docker-manifest');

suite('docker image with manifest.json file', function() {
  test('docker manifest', async () => {
    let worker = new TestWorker(DockerWorker);
    await worker.launch();

    const imageTaskId = slugid.v4();
    const taskDef = worker.TaskFactory.create({
      schedulerId: 'docker-worker-tests',
      taskGroupId: imageTaskId,
      payload: {
        image: 'taskcluster/test-ubuntu',
        artifacts: {
          'public/image.tar.zst': {
            type: 'file',
            expires: expires(),
            path: '/image.tar.zst'
          }
        },
        maxRunTime: 5 * 60
      }
    });
    taskDef.provisionerId = 'null-provisioner';

    debug(`Creating image task ${imageTaskId}`);
    // create an artifact image with a manifest.json file
    await worker.queue.createTask(imageTaskId, taskDef);

    await worker.queue.claimTask(imageTaskId, 0, {
      workerGroup: 'docker-worker',
      workerId: 'docker-worker'
    });

    await worker.queue.createArtifact(imageTaskId, 0, 'public/image.tar.zst', {
      storageType: 'reference',
      expires: expires(),
      contentType: mime.lookup('image.tar.zst'),
      url: 'https://s3-us-west-2.amazonaws.com/docker-worker-manifest-test/image.tar.zst'
    });

    await worker.queue.reportCompleted(imageTaskId, 0);
    const status = await waitTaskCompletion(worker.queue, imageTaskId);

    assert.equal(status.state, 'completed', 'task should be successful');

    let task = await worker.postToQueue({
      payload: {
        image: {
          path: 'public/image.tar.zst',
          type: 'task-image',
          taskId: imageTaskId
        },
        command: cmd('sleep 1'),
        maxRunTime: 5 * 60
      }
    });

    assert.equal(task.run.state, 'completed', 'task should be successful');
    assert.equal(task.run.reasonResolved, 'completed', 'task should be successful');

    worker.terminate();
  });
});
