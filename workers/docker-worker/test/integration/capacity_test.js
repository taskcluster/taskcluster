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
const promiseRetry = require('promise-retry');

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
    // Add 10 more seconds to count for external factors slowing down task execution
    const SLEEP = 2;
    const DEADLINE = SLEEP * CAPACITY + 10;

    // As measuring parallelism with timing is sensible to a lot of random
    // variables that may cause the test to fail, we try to test it 10 times,
    // if at least once the tests were successful, we consider the test successful.
    //
    // The right way to do that would be run the tests N times, where N is a
    // statistically accurate integer, remove the outliers, calculate the variance
    // and then infer if the test passed or not, but we are kind of out of time
    // to dedicate to a code that is doomed to be deprecated.
    await promiseRetry(async (retry, number) => {
      const tasks = [];

      for (let i = 0; i < CAPACITY; i++) {
        tasks.push(worker.postToQueue({
          payload: {
            features: {
              localLiveLog: false
            },
            image: IMAGE,
            command: cmd(
              'sleep ' + SLEEP
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
      const start = Date.now();

      const results = await Promise.all(tasks);
      const end = (Date.now() - start) / 1000;

      assert.equal(results.length, CAPACITY, `all ${CAPACITY} tasks must have completed`);
      results.forEach((taskRes) => {
        assert.equal(taskRes.run.state, 'completed');
        assert.equal(taskRes.run.reasonResolved, 'completed');
      });

      return (end < DEADLINE
        ? Promise.resolve()
        : Promise.reject(new Error('deadline exceeded'))
      ).catch(retry);
    }, {
      retries: 10,
      factor: 1,
      randomize: true,
    }).catch(e => assert.fail('Failed to run tasks in parallel'));
  });
});
