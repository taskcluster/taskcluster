const assert = require('assert');
const devnull = require('dev-null');
const waitForEvent = require('../../src/lib/wait_for_event');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const Docker = require('../../src/lib/docker');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const ImageManager = require('../../src/lib/docker/image_manager');
const {createLogger} = require('../../src/lib/log');

let docker = Docker();

suite('Capacity', () => {
  const CAPACITY = 10;
  const IMAGE = 'taskcluster/test-ubuntu:latest';

  var imageManager = new ImageManager({
    docker: docker,
    dockerConfig: {
      defaultRegistry: 'registry.hub.docker.com',
      maxAttempts: 5,
      delayFactor: 15 * 1000,
      randomizationFactor: 0.25
    },
    log: createLogger()
  });

  var worker;
  setup(async () => {
    // Ensure that the image is available before starting test to not skew
    // task run times
    await imageManager.ensureImage(IMAGE, devnull());
    settings.configure({
      deviceManagement: {
        cpu: {
          enabled: false
        },
        loopbackAudio: {
          enabled: false
        },
        loopbackVideo: {
          enabled: false
        }
      },
      capacity: CAPACITY,
      capacityManagement: {
        diskspaceThreshold: 1
      },
      taskQueue: {
        pollInterval: 1000
      }
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    await worker.terminate();
    settings.cleanup();
  });

  test(CAPACITY + ' tasks in parallel', async () => {
    var sleep = 2;
    var tasks = [];

    for (var i = 0; i < CAPACITY; i++) {
      tasks.push(worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false
          },
          image: IMAGE,
          command: cmd(
            'sleep ' + sleep
          ),
          maxRunTime: 60 * 60
        }
      }));
    }

    // The logic here is a little weak but the idea is if run in parallel the
    // total runtime should be _less_ then sleep * CAPACITY even with overhead.

    // Wait for the first claim to start timing.  This weeds out any issues with
    // waiting for the task queue to be polled
    await waitForEvent(worker, 'claimed task');
    var start = Date.now();

    var results = await Promise.all(tasks);
    var end = (Date.now() - start) / 1000;

    assert.equal(results.length, CAPACITY, `all ${CAPACITY} tasks must have completed`);
    results.forEach((taskRes) => {
      assert.equal(taskRes.run.state, 'completed');
      assert.equal(taskRes.run.reasonResolved, 'completed');
    });
    // Add 10 more seconds to count for external factors slowing down task execution
    assert.ok(end < sleep * CAPACITY + 10,
      `tasks ran in parallel. Duration ${end} seconds > expected ${sleep * CAPACITY}`);
  });
});
