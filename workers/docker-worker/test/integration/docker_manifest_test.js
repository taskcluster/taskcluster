import assert from 'assert';
import getArtifact from './helper/get_artifact';
import cmd from './helper/cmd';
import expires from './helper/expires';
import TestWorker from '../testworker';
import DockerWorker from '../dockerworker';
import iptables from 'iptables';
import _ from 'lodash';

suite('docker image with manifest.json file', function() {
  test('docker manifest', async () => {
    let worker = new TestWorker(DockerWorker);
    await worker.launch();

    // create an artifact image with a manifest.json file
    let imageTask = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          '/usr/bin/python3 -c \'from urllib.request import urlretrieve; urlretrieve("https://s3-us-west-2.amazonaws.com/docker-worker-manifest-test/image.tar.zst", "/image.tar.zst")\''
        ),
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

    assert.equal(imageTask.run.state, 'completed', 'task should be successful');
    assert.equal(imageTask.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(imageTask.artifacts['public/image.tar.zst'], 'artifact should be present');

    let task = await worker.postToQueue({
      payload: {
        image: {
          path: 'public/image.tar.zst',
          type: 'task-image',
          taskId: imageTask.taskId
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
