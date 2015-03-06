import fs from 'fs';
import slugid from 'slugid';
import co from 'co';
import taskcluster from 'taskcluster-client';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

var jsonFromUrl = JSON.parse(fs.readFileSync('test/integration/cancelTaskReference.json'));

suite('Cancel Task', () => {
  test("cancel", async () => {
    var queue = new taskcluster.Queue();
    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command:        [
          '/bin/bash', '-c', 'echo "Hello"; sleep 60; echo "done";'
        ],
        features: {
          localLiveLog: false
        },
        maxRunTime: 60 * 60
      }
    };
    var taskId = slugid.v4();
    var worker = new TestWorker(DockerWorker);
    let canceledTask;
    worker.on('task run', co(function* () { yield queue.cancelTask(taskId); }));
    worker.on('cancel task', () => { canceledTask = true });
    var launch = await worker.launch();
    var result = await worker.postToQueue(task, taskId);
    assert.ok(canceledTask, 'task execution should have been canceled');
    await worker.terminate();
  });
});

