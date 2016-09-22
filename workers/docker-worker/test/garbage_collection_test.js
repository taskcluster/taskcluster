suite('garbage collection tests', function () {
  var assert = require('assert');
  var co = require('co');
  var debug = require('debug')('garbageCollectionTests');
  var fs = require('fs');
  var devnull = require('dev-null');
  var docker = require('../lib/docker')();
  var GarbageCollector = require('../lib/gc');
  var ImageManager = require('../lib/docker/image_manager');
  var logger = require('../lib/log').createLogger;
  var VolumeCache = require('../lib/volume_cache');
  var waitForEvent = require('../lib/wait_for_event');
  var path = require('path');
  var rmrf = require('rimraf');
  var removeImage = require('../lib/util/remove_image').removeImage;
  var base = require('taskcluster-base');
  var monitoring = require('taskcluster-lib-monitor');
  var sleep = require('../lib/util/sleep');

  var IMAGE = 'taskcluster/test-ubuntu';

  var localCacheDir = path.join(__dirname, 'tmp');
  var monitor;
  var imageManager;

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
    monitor = yield monitoring({
        credentials: {},
        project: 'docker-worker-tests',
        mock: true
    });

    imageManager = new ImageManager({
      docker: docker,
      dockerConfig: {
        defaultRegistry: 'registry.hub.docker.com',
        maxAttempts: 5,
        delayFactor: 15 * 1000,
        randomizationFactor: 0.25
      },
      log: logger(),
      monitor: monitor
    });
  })),

  teardown(function () {
    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  }),

  test('remove container', co(function* () {
    var imageId = yield imageManager.ensureImage(IMAGE, devnull());
    var testMarkedContainers = [];

    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0 } },
      monitor: monitor
    });

    var container = yield docker.createContainer({Image: imageId});
    gc.removeContainer(container.id);
    yield gc.sweep();
    assert.ok(!gc.markedContainers.length,
              'List of marked containers is not empty when it should be');
  })),

  test('remove running container', co(function* () {
    var imageId = yield imageManager.ensureImage(IMAGE, devnull());
    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0; } },
      monitor: monitor
    });

    var container = yield docker.createContainer({Image: imageId,
      Cmd: ['/bin/bash', '-cvex', 'sleep 5']});
    var containerId = container.id;
    container = docker.getContainer(containerId);
    yield container.start();

    gc.removeContainer(containerId);
    assert.ok(containerId in gc.markedContainers,
              'Container was not found in the list of garbage ' +
              'collected containers.');

    yield gc.sweep();
    assert.ok(!(containerId in gc.markedContainers),
              'Container was found in the list of garbage ' +
              'collected containers.');
  })),

  test('container removal retry limit exceeded', co(function* () {
    var imageId = yield imageManager.ensureImage(IMAGE, devnull());
    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0 } },
      monitor: monitor
    });

    var container = yield docker.createContainer({Image: imageId});
    gc.removeContainer(container.id);
    gc.markedContainers[container.id].retries = 0;
    yield gc.sweep();

    assert.ok(!(container.id in gc.markedContainers),
              'Container has exceeded the retry limit but has not been ' +
              'removed from the list of marked containers.');
    assert.ok(gc.ignoredContainers.indexOf(container.id) !== -1,
              'Container has exceeded the retry limit but has not been ' +
              'added to the list of ignored containers');

    var c = docker.getContainer(container.id);
    yield c.remove({force: true});
  })),

  test('remove container that does not exist', co(function* () {
    var imageId = yield imageManager.ensureImage(IMAGE, devnull());
    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0 } },
      monitor: monitor
    });

    var container = yield docker.createContainer({Image: imageId});
    gc.removeContainer(container.id);

    container = docker.getContainer(container.id);
    yield container.remove();

    yield gc.sweep();

    assert.ok(!(container.id in gc.markedContainers),
              'Container does not exist anymore but has not been ' +
              'removed from the list of marked containers.');
  }));

  test('remove marked images that are not in use', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5,
      containerExpiration: 5,
      monitor: monitor
    });

    var imageName = 'busybox:ubuntu-14.04';
    var imageId = yield imageManager.ensureImage(imageName, devnull());

    var container = yield docker.createContainer({Image: imageId,
      Cmd: ['/bin/sh', '-c', 'ls && sleep 5']});
    container = docker.getContainer(container.id);
    yield container.start();

    gc.markImage(imageId);
    yield gc.sweep(true);

    assert(gc.markedImages[imageId], 'Image does not appear in list of marked images');

    yield sleep(6000);
    yield gc.sweep(true);
    assert(!gc.markedImages[imageId], 'Image should have been removed from marked images list');

    imageId = yield getImageId(docker, imageName);
    assert.ok(!imageId, 'Image has not been removed.');
  }));

  test('images are removed when expiration is reached', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 1 * 100000000,
      containerExpiration: 1,
      monitor: monitor
    });

    var imageName = 'busybox:ubuntu-14.04';
    var imageId = yield imageManager.ensureImage(imageName, devnull());

    gc.markImage(imageId);
    yield gc.sweep(true);
    assert(gc.markedImages[imageId]);


    gc.markedImages[imageId] = new Date();

    yield gc.sweep(true);

    imageId = yield getImageId(docker, imageName);
    assert.ok(!imageId, 'Image has not been removed.');
  }));

  test('unexpired images are not removed when diskspace threshold is not reached',
    co(function* () {
      var gc = new GarbageCollector({
        capacity: 2,
        log: debug,
        docker: docker,
        dockerVolume: '/',
        taskListener: { availableCapacity: async () => { return 1 } },
        diskspaceThreshold: 1 * 100000000,
        imageExpiration: 10000000,
        containerExpiration: 1,
        monitor: monitor
      });

      var imageName = 'busybox:ubuntu-14.04';
      var imageId = yield imageManager.ensureImage(imageName, devnull());

      gc.markImage(imageId);
      yield gc.sweep(true);
      imageId = yield getImageId(docker, imageName);
      assert.ok(imageId, 'Image has been removed.');

      gc.diskspaceThreshold = 500000 * 100000000;
      yield gc.sweep(true);

      imageId = yield getImageId(docker, imageName);
      assert.ok(!imageId, 'Image has not been removed.');
    })
  );

  test('unexpired images are removed when diskspace threshold is reached',
    co(function* () {
      var gc = new GarbageCollector({
        capacity: 2,
        log: debug,
        docker: docker,
        dockerVolume: '/',
        taskListener: { availableCapacity: async () => { return 1 } },
        diskspaceThreshold: 5000000 * 100000000,
        imageExpiration: 1,
        monitor: monitor
      });

      var imageName = 'busybox:ubuntu-14.04';
      var imageId = yield imageManager.ensureImage(imageName, devnull());

      gc.markImage(imageId);
      yield gc.sweep(true);

      imageId = yield getImageId(docker, imageName);
      assert.ok(!imageId, 'Image has not been removed.');
    })
  );

  test('remove image that does not exist', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 1 * 100000000,
      imageExpiration: 5,
      monitor: monitor
    });

    var imageName = 'busybox:ubuntu-14.04';
    var imageId = yield imageManager.ensureImage(imageName, devnull());
    gc.markImage(imageId);

    var image = docker.getImage(imageId);
    yield removeImage(docker, imageId);

    yield gc.sweep();

    assert.ok(!(imageName in gc.markedImages),
              'Image still appears in the list of marked images');
  }));

  test('clear volume cache when diskspace threshold reached', co(function* () {
    var gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1 } },
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5,
      monitor: monitor
    });

    var cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir
      },
      log: debug,
      monitor: monitor
    });

    gc.addManager(cache);

    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    var fullPath = path.join(localCacheDir, cacheName);

    var instance1 = yield cache.get(cacheName);
    var instance2 = yield cache.get(cacheName);
    cache.set(instance2.key, {mounted: false});

    yield gc.sweep();

    assert.ok(fs.existsSync(instance1.path));
    assert.ok(!fs.existsSync(instance2.path));
  }));

  test('Unmarked exited containers are marked for removal when expiration reached',
    co(function* () {
      var imageId = yield imageManager.ensureImage(IMAGE, devnull());
      var containerExpiration =  1000;

      var gc = new GarbageCollector({
        capacity: 1,
        log: debug,
        docker: docker,
        taskListener: {availableCapacity: async () => { return 0; }},
        containerExpiration: containerExpiration,
        monitor: monitor
      });

      var container = yield docker.createContainer({Image: imageId,
        Cmd: ['/bin/bash', '-c', 'echo "hello"']
      });
      var containerId = container.id;
      container = docker.getContainer(container.id);
      yield container.start();

      var removedIds = [];
      gc.on('gc:container:removed', msg => { removedIds.push(msg.id); });

      var start = Date.now();
      while (!removedIds.includes(containerId)) {
        yield gc.sweep();
      }
      var stop = Date.now();
      var duration = stop - start;
      assert.ok(
        duration > containerExpiration,
        `Should have waited at least ${containerExpiration / 1000} seconds ` +
        `before marking for removal. Duration: ${duration / 1000} seconds`
      );
    })
  );
});
