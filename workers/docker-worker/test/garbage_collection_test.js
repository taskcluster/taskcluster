
suite('garbage collection tests', function () {
  var co = require('co');
  var createLogger = require('../lib/log');
  var docker = require('../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var GarbageCollector = require('../lib/gc');
  var IMAGE = 'taskcluster/test-ubuntu';
  var streams = require('stream');
  var waitForEvent = require('../lib/wait_for_event');

  var stdout = new streams.PassThrough();

  var log = createLogger({
    source: 'top', // top level logger details...
    provisionerId: 'test_provisioner',
    workerId: 'test_worker',
    workerGroup: 'test_worker_group',
    workerType: 'test_worker_type'
  });

  this.timeout(10 * 1000);

  setup(co(function* () {
    yield new Promise(function(accept, reject) {
      // pull the image (or use on in the cache and output status in stdout)
      var pullStream =
        dockerUtils.pullImageIfMissing(docker, IMAGE);

      // pipe the pull stream into stdout but don't end
      pullStream.pipe(stdout, { end: false });

      pullStream.once('error', reject);
      pullStream.once('end', function() {
        pullStream.removeListener('error', reject);
        accept();
      }.bind(this));
    }.bind(this));
  }));

  test('remove container', co(function* () {
    var testMarkedContainers = [];

    var gc = new GarbageCollector({
      log: log,
      docker: docker,
      interval: 2 * 1000
    });

    var container = yield docker.createContainer({Image: IMAGE});
    gc.removeContainer(container.id);

    var removedContainerId = yield waitForEvent(gc, 'gc:container:removed');
    assert.ok(!(removedContainerId in gc.markedContainers),
              'Container was found in the list of garbage ' +
              'collected containers.');

    yield waitForEvent(gc, 'gc:sweep:stop')
    assert.ok(!gc.markedContainers.length,
              'List of marked containers is not empty when it should be');
    clearTimeout(gc.sweepTimeoutId);
 }));

  test('remove running container', co(function* () {
    var gc = new GarbageCollector({
      log: log,
      docker: docker,
      interval: 2 * 1000
    });

    var container = yield docker.createContainer({Image: IMAGE,
      Cmd: '/bin/bash && sleep 60'});
    gc.removeContainer(container.id);

    var removedContainerId = yield waitForEvent(gc, 'gc:container:removed');
    assert.ok(!(removedContainerId in gc.markedContainers),
              'Container was found in the list of garbage ' +
              'collected containers.');

    yield waitForEvent(gc, 'gc:sweep:stop')
    assert.ok(!gc.markedContainers.length,
              'List of marked containers is not empty when it should be');
    clearTimeout(gc.sweepTimeoutId);
  }));

  test('container removal retry limit exceeded', co(function* () {
      var gc = new GarbageCollector({
        log: log,
        docker: docker,
        interval: 2 * 1000
      });

      var container = yield docker.createContainer({Image: IMAGE});
      gc.removeContainer(container.id);
      gc.markedContainers[container.id] = 0;

      var error = yield waitForEvent(gc, 'gc:error');
      assert.ok(error.container === container.id);
      assert.ok(error.error === 'Retry limit exceeded',
                'Error message does not match \'Retry limit exceeded\'');
      assert.ok(!(error.container in gc.markedContainers),
                'Container has exceeded the retry limit but has not been ' +
                'removed from the list of marked containers.');
      assert.ok(gc.ignoredContainers.indexOf(error.container) !== -1,
                'Container has exceeded the retry limit but has not been ' +
                'added to the list of ignored containers');

      var c = docker.getContainer(container.id);
      yield c.remove({force: true});
      clearTimeout(gc.sweepTimeoutId);
  }));
});
