suite('garbage collection tests', function () {
  var co = require('co');
  var fs = require('fs');
  var createLogger = require('../lib/log');
  var debug = require('debug')('garbageCollectionTests');
  var devnull = require('dev-null');
  var docker = require('../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var pullImage = require('../lib/pull_image_to_stream').pullImageStreamTo;
  var GarbageCollector = require('../lib/gc');
  var VolumeCache = require('../lib/volume_cache');
  var streams = require('stream');
  var waitForEvent = require('../lib/wait_for_event');
  var path = require('path');
  var mkdirp = require('mkdirp');
  var rmrf = require('rimraf');

  var IMAGE = 'taskcluster/test-ubuntu';

  var localCacheDir = path.join(__dirname, 'tmp');

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
    yield pullImage(docker, IMAGE, devnull());
  }));

  teardown(function () {
    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  });

  test('remove container', co(function* () {
    var testMarkedContainers = [];

    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 0 } },
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
      log: debug,
      docker: docker,
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 0 } },
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
      log: debug,
      docker: docker,
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 0 } },
    });

      var container = yield docker.createContainer({Image: IMAGE});
      gc.removeContainer(container.id);
      gc.markedContainers[container.id].retries = 0;

      var error = yield waitForEvent(gc, 'gc:container:error');
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

  test('remove container that does not exist', co(function* () {
    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 0 } },
    });
      clearTimeout(gc.sweepTimeoutId);

      var container = yield docker.createContainer({Image: IMAGE});
      gc.removeContainer(container.id);

      container = docker.getContainer(container.id);
      yield container.remove();

      gc.sweep();

      var error = yield waitForEvent(gc, 'gc:container:error');
      var errorMessage = 'No such container. Will remove from marked ' +
                         'containers list.';
      assert.ok(error.container === container.id);
      assert.ok(error.message === errorMessage),
      assert.ok(!(error.container in gc.markedContainers),
                'Container does not exist anymore but has not been ' +
                'removed from the list of marked containers.');

      yield waitForEvent(gc, 'gc:sweep:stop');
      clearTimeout(gc.sweepTimeoutId);
  }));

  test('remove marked images that are not in use', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5,
      containerExpiration: 5
    });

    clearTimeout(gc.sweepTimeoutId);

    var imageName = 'busybox:ubuntu-14.04';
    yield pullImage(docker, imageName, devnull());

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
      log: debug,
      docker: docker,
      dockerVolume: '/',
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 1 * 100000000,
      containerExpiration: 1
    });

    clearTimeout(gc.sweepTimeoutId);

    var imageName = 'busybox:ubuntu-14.04';
    yield pullImage(docker, imageName, devnull());

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
        log: debug,
        docker: docker,
        dockerVolume: '/',
        interval: 2 * 1000,
        taskListener: { availableCapacity: async () => { return 1 } },
        diskspaceThreshold: 1 * 100000000,
        imageExpiration: 1,
        containerExpiration: 1
      });

      clearTimeout(gc.sweepTimeoutId);

      var imageName = 'busybox:ubuntu-14.04';
      yield pullImage(docker, imageName, devnull());

      gc.markImage(imageName);
      gc.sweep();

      var infoMessage = yield waitForEvent(gc, 'gc:diskspace:info');
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
        log: debug,
        docker: docker,
        dockerVolume: '/',
        interval: 2 * 1000,
        taskListener: { availableCapacity: async () => { return 1 } },
        diskspaceThreshold: 5000000 * 100000000,
        imageExpiration: 1
      });

      clearTimeout(gc.sweepTimeoutId);

      var imageName = 'busybox:ubuntu-14.04';
      yield pullImage(docker, imageName, devnull());

      gc.markImage(imageName);
      gc.sweep();

      var warningMessage = yield waitForEvent(gc, 'gc:diskspace:warning');
      var msg = 'Diskspace threshold reached. Removing all non-running images.';
      assert.ok(msg === warningMessage.message);

      yield waitForEvent(gc, 'gc:image:removed');
      var imageId = yield getImageId(docker, imageName);
      assert.ok(!imageId, 'Image has not been removed.');

      yield waitForEvent(gc, 'gc:sweep:stop');
      clearTimeout(gc.sweepTimeoutId);
    })
  );

  test('remove image that does not exist', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 1 * 100000000,
      imageExpiration: 5
    });

    clearTimeout(gc.sweepTimeoutId);

    var imageName = 'busybox:ubuntu-14.04';
    yield pullImage(docker, imageName, devnull());
    gc.markImage(imageName);

    var imageId = yield getImageId(docker, imageName);
    var image = docker.getImage(imageId);
    yield image.remove();

    gc.sweep();

    var removalError = yield waitForEvent(gc, 'gc:image:error');
    var errorMessage = 'No such image. Will remove from marked images list.';
    assert.ok(errorMessage === removalError.message);
    assert.ok(imageName === removalError.image.name);
    assert.ok(!(imageName in gc.markedImages),
              'Image still appears in the list of marked images');

    yield waitForEvent(gc, 'gc:sweep:stop');
    clearTimeout(gc.sweepTimeoutId);
  }));

  test('clear volume cache when diskspace threshold reached', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5
    });

    clearTimeout(gc.sweepTimeoutId);


    var stats = {
      increment: function(stat) { return; },
      timeGen: async (stat, fn) => { await fn; }
    };

    var cache = new VolumeCache({
      rootCachePath: localCacheDir,
      log: debug,
      stats: stats
    });

    gc.addManager(cache);

    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    var fullPath = path.join(localCacheDir, cacheName);

    var instance1 = yield cache.get(cacheName);
    var instance2 = yield cache.get(cacheName);
    cache.set(instance2.key, {mounted: false});

    gc.sweep();

    yield waitForEvent(gc, 'gc:sweep:stop');

    clearTimeout(gc.sweepTimeoutId);

    assert.ok(fs.existsSync(instance1.path));
    assert.ok(!fs.existsSync(instance2.path));
  }));

  test('Unmarked exited containers are marked for removal when expiration reached',
    co(function* () {
      var testMarkedContainers = [];
      var containerExpiration = 10 * 1000;

      var gc = new GarbageCollector({
        capacity: 1,
        log: debug,
        docker: docker,
        interval: 2 * 1000,
        taskListener: { availableCapacity: async () => { return 0 } },
        containerExpiration: containerExpiration
      });

      clearTimeout(gc.sweepTimeoutId);

      var container = yield docker.createContainer({Image: IMAGE,
        Cmd: ['/bin/bash', '-c', 'echo "hello"']
      });
      var containerId = container.id;
      container = docker.getContainer(container.id);
      container.start();

      gc.sweep();
      var start = Date.now();
      var markedContainerId;
      while (markedContainerId !== containerId) {
        markedContainerId = yield waitForEvent(gc, 'gc:container:marked');
      }
      var stop = Date.now();
      var removedContainer = yield waitForEvent(gc, 'gc:container:removed');
      var duration = stop - start;
      assert.ok(
        duration > containerExpiration,
        `Should have waited at least ${containerExpiration/1000} seconds ` +
        `before marking for removal. Duration: ${duration/1000} seconds`
      );
      assert.equal(
        containerId,
        removedContainer.id,
        'Container ID of removed container did not match. ' +
        `Expected: ${containerId} Actual: ${removedContainer.id}`
      );

      yield waitForEvent(gc, 'gc:sweep:stop');
      clearTimeout(gc.sweepTimeoutId);
    })
  );

  test('Garbage collection cycle occurs when available capacity is 0', co(function* () {
    var testMarkedContainers = [];

    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 0 } },
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5
    });

    yield waitForEvent(gc, 'gc:diskspace:warning');
    clearTimeout(gc.sweepTimeoutId);
 }));
});
