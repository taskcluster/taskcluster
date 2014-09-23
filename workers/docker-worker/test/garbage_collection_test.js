suite('garbage collection tests', function () {
  var co = require('co');
  var createLogger = require('../lib/log');
  var docker = require('../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var pullImage = require('../lib/pull_image_to_stream'); 
  var GarbageCollector = require('../lib/gc');
  var IMAGE = 'taskcluster/test-ubuntu';
  var streams = require('stream');
  var waitForEvent = require('../lib/wait_for_event');

  var log = createLogger({
    source: 'top', // top level logger details...
    provisionerId: 'test_provisioner',
    workerId: 'test_worker',
    workerGroup: 'test_worker_group',
    workerType: 'test_worker_type'
  });

  function* getImageId(docker, imageName) {
    var dockerImages = yield docker.listImages();
    var imageId;
    dockerImages.forEach(function (dockerImage) {
      if (dockerImage.RepoTags.indexOf(imageName) !== -1) {
        imageId = dockerImage.Id;
      }
    });
    return imageId;
  }

  setup(co(function* () {
    yield new Promise(function(accept, reject) {
      // pull the image (or use on in the cache and output status in stdout)
      var pullStream =
        dockerUtils.pullImageIfMissing(docker, IMAGE);

      // pipe the pull stream into stdout but don't end
      pullStream.pipe(process.stdout, { end: false });

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
      capacity: 1,
      log: log,
      docker: docker,
      interval: 2 * 1000,
      taskListener: {pending: 1}
    });

    var container = yield docker.createContainer({Image: IMAGE});
    gc.removeContainer(container.id);

    var removedContainerId = yield waitForEvent(gc, 'gc:container:removed');
    assert.ok(!(removedContainerId in gc.markedContainers),
              'Container was found in the list of garbage ' +
              'collected containers.');

    yield waitForEvent(gc, 'gc:sweep:stop');
    assert.ok(!gc.markedContainers.length,
              'List of marked containers is not empty when it should be');

    yield waitForEvent(gc, 'gc:sweep:stop');
    clearTimeout(gc.sweepTimeoutId);
 }));

  test('remove running container', co(function* () {
    var gc = new GarbageCollector({
      capacity: 1,
      log: log,
      docker: docker,
      interval: 2 * 1000,
      taskListener: {pending: 1}
    });

    var container = yield docker.createContainer({Image: IMAGE,
      Cmd: ['/bin/bash', '-cvex', 'sleep 60']});
    var containerId = container.id;
    container = docker.getContainer(containerId);
    container.start();

    gc.removeContainer(containerId);

    var removedContainerId = yield waitForEvent(gc, 'gc:container:removed');
    assert.ok(!(removedContainerId in gc.markedContainers),
              'Container was found in the list of garbage ' +
              'collected containers.');

    yield waitForEvent(gc, 'gc:sweep:stop');
    assert.ok(!gc.markedContainers.length,
              'List of marked containers is not empty when it should be');

    yield waitForEvent(gc, 'gc:sweep:stop');
    clearTimeout(gc.sweepTimeoutId);
  }));

  test('container removal retry limit exceeded', co(function* () {
    var gc = new GarbageCollector({
      capacity: 1,
      log: log,
      docker: docker,
      interval: 2 * 1000,
      taskListener: {pending: 1}
    });

      var container = yield docker.createContainer({Image: IMAGE});
      gc.removeContainer(container.id);
      gc.markedContainers[container.id] = 0;

      var error = yield waitForEvent(gc, 'gc:error');
      assert.ok(error.container === container.id);
      assert.ok(error.message === 'Retry limit exceeded',
                'Error message does not match \'Retry limit exceeded\'');
      assert.ok(!(error.container in gc.markedContainers),
                'Container has exceeded the retry limit but has not been ' +
                'removed from the list of marked containers.');
      assert.ok(gc.ignoredContainers.indexOf(error.container) !== -1,
                'Container has exceeded the retry limit but has not been ' +
                'added to the list of ignored containers');

      var c = docker.getContainer(container.id);
      yield c.remove({force: true});

      yield waitForEvent(gc, 'gc:sweep:stop');
      clearTimeout(gc.sweepTimeoutId);
  }));

  test('remove marked images that are not in use', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: log,
      docker: docker,
      dockerVolume: '/',
      interval: 2 * 1000,
      taskListener: {pending: 1},
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5
    });

    clearTimeout(gc.sweepTimeoutId);

    var imageName = 'busybox:latest';
    yield pullImage(docker, imageName, process.stdout);

    var container = yield docker.createContainer({Image: imageName,
      Cmd: ['/bin/sh', '-c', 'ls && sleep 5']});
    container = docker.getContainer(container.id);
    container.start();

    gc.markImage(imageName);
    gc.sweep();

    var removalWarning = yield waitForEvent(gc, 'gc:image:warning');
    assert.ok('Cannot remove image while it is running.' === removalWarning.message);
    assert.ok(imageName === removalWarning.image.name);

    var removedImage = yield waitForEvent(gc, 'gc:image:removed');
    assert.ok(imageName === removedImage.image.name);

    var imageId = yield getImageId(docker, imageName);
    assert.ok(!imageId, 'Image has not been removed.');

    yield waitForEvent(gc, 'gc:sweep:stop');
    clearTimeout(gc.sweepTimeoutId);
  }));

  test('images are removed when expiration is reached', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: log,
      docker: docker,
      dockerVolume: '/',
      interval: 2 * 1000,
      taskListener: {pending: 1},
      diskspaceThreshold: 1 * 100000000,
    });

    clearTimeout(gc.sweepTimeoutId);

    var imageName = 'busybox:latest';
    yield pullImage(docker, imageName, process.stdout);

    var container = yield docker.createContainer({Image: imageName,
      Cmd: ['/bin/sh', '-c', 'ls']});
    container = docker.getContainer(container.id);
    container.start();

    gc.markImage(imageName);
    gc.sweep();

    var infoMessage = yield waitForEvent(gc, 'gc:image:info');
    assert.ok('Image expiration has not been reached.' === infoMessage.info);

    gc.markedImages[imageName] = new Date();

    var removedImage = yield waitForEvent(gc, 'gc:image:removed');
    assert.ok(imageName === removedImage.image.name);

    var imageId = yield getImageId(docker, imageName);
    assert.ok(!imageId, 'Image has not been removed.');

    yield waitForEvent(gc, 'gc:sweep:stop');
    clearTimeout(gc.sweepTimeoutId);
  }));

  test('unexpired images are not removed when diskspace threshold is not reached',
    co(function* () {
      var gc = new GarbageCollector({
        capacity: 2,
        log: log,
        docker: docker,
        dockerVolume: '/',
        interval: 2 * 1000,
        taskListener: {pending: 1},
        diskspaceThreshold: 1 * 100000000,
        imageExpiration: 1
      });

      clearTimeout(gc.sweepTimeoutId);

      var imageName = 'busybox:latest';
      yield pullImage(docker, imageName, process.stdout);

      gc.markImage(imageName);
      gc.sweep();

      var infoMessage = yield waitForEvent(gc, 'gc:info');
      var msg = 'Diskspace threshold not reached. Removing only expired images.';
      assert.ok(msg === infoMessage.message);

      gc.diskspaceThreshold = 500000 * 100000000;

      var removedImage = yield waitForEvent(gc, 'gc:image:removed');
      assert.ok(imageName === removedImage.image.name);

      var imageId = yield getImageId(docker, imageName);
      assert.ok(!imageId, 'Image has not been removed.');

      yield waitForEvent(gc, 'gc:sweep:stop');
      clearTimeout(gc.sweepTimeoutId);
    })
  );

  test('unexpired images are removed when diskspace threshold is reached',
    co(function* () {
      var gc = new GarbageCollector({
        capacity: 2,
        log: log,
        docker: docker,
        dockerVolume: '/',
        interval: 2 * 1000,
        taskListener: {pending: 1},
        diskspaceThreshold: 5000000 * 100000000,
        imageExpiration: 1
      });

      clearTimeout(gc.sweepTimeoutId);

      var imageName = 'busybox:latest';
      yield pullImage(docker, imageName, process.stdout);

      gc.markImage(imageName);
      gc.sweep();

      var warningMessage = yield waitForEvent(gc, 'gc:warning');
      var msg = 'Diskspace threshold reached. Removing all non-running images.';
      assert.ok(msg === warningMessage.message);

      yield waitForEvent(gc, 'gc:image:removed');
      var imageId = yield getImageId(docker, imageName);
      assert.ok(!imageId, 'Image has not been removed.');

      yield waitForEvent(gc, 'gc:sweep:stop');
      clearTimeout(gc.sweepTimeoutId);
    })
  );
});
