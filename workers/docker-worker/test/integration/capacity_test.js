suite('Capacity', function() {
  var assert = require('assert');
  var co = require('co');
  var devnull = require('dev-null');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');
  var docker = require('../../lib/docker')();
  var pullImage = require('../../lib/pull_image_to_stream').pullImageStreamTo;
  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  const CAPACITY = 10;
  const IMAGE = 'taskcluster/test-ubuntu:latest';

  var worker;
  setup(co(function * () {
    // Ensure that the image is available before starting test to not skew
    // task run times
    yield pullImage(docker, IMAGE, devnull());
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
        // Make the poll very high so that once tasks start, it will not
        // poll again to interupt the event loop
        pollInterval: 30 * 1000,
        expiration: 5 * 60 * 1000,
        maxRetries: 5,
        requestRetryInterval: 2 * 1000
      }
    });

    worker = new TestWorker(DockerWorker);
    yield worker.launch();
  }));

  teardown(co(function* () {
    yield worker.terminate();
    settings.cleanup();
  }));

  test(CAPACITY + ' tasks in parallel', co(function* () {
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
    yield waitForEvent(worker, 'claim task');
    var start = Date.now();

    var results = yield tasks;
    var end = (Date.now() - start) / 1000;

    assert.equal(results.length, CAPACITY, `all ${CAPACITY} tasks must have completed`);
    results.forEach(function(taskRes) {
      assert.equal(taskRes.run.state, 'completed');
      assert.equal(taskRes.run.reasonResolved, 'completed');
    });
    assert.ok(end < sleep * CAPACITY,
      `tasks ran in parallel. Duration ${end} seconds > expected ${sleep * CAPACITY}`);
  }));
});
