const taskcluster = require('taskcluster-client');
const {suiteName} = require('taskcluster-lib-testing');
const libUrls = require('taskcluster-lib-urls');
const ImageManager = require('../src/lib/docker/image_manager');
const sleep = require('../src/lib/util/sleep');
const VolumeCache = require('../src/lib/volume_cache');
const assert = require('assert');
const Debug = require('debug');
const fs = require('fs');
const devnull = require('dev-null');
const Docker = require('../src/lib/docker');
const GarbageCollector = require('../src/lib/gc');
const {createLogger} = require('../src/lib/log');
const path = require('path');
const rmrf = require('rimraf');
const {removeImage} = require('../src/lib/util/remove_image');
const monitor = require('./fixtures/monitor');
const helper = require('./helper');

let docker = Docker();
let debug = Debug('garbageCollectionTests');

async function getImageId(docker, imageName) {
  let dockerImages = await docker.listImages();
  let imageId;
  dockerImages.forEach((dockerImage) => {
    if ((dockerImage.RepoTags || []).indexOf(imageName) !== -1) {
      imageId = dockerImage.Id;
    }
  });
  return imageId;
}

helper.secrets.mockSuite(suiteName(), ['docker'], function(mock, skipping) {
  if (mock) {
    return; // Only test with docker
  }

  let IMAGE = 'taskcluster/test-ubuntu';

  let localCacheDir = path.join(__dirname, 'tmp');
  let imageManager;

  setup(async () => {
    taskcluster.config(helper.optionsFromCiCreds());

    imageManager = new ImageManager({
      docker: docker,
      dockerConfig: {
        defaultRegistry: 'registry.hub.docker.com',
        maxAttempts: 5,
        delayFactor: 15 * 1000,
        randomizationFactor: 0.25,
      },
      log: createLogger(),
      monitor: monitor,
    });
  }),

  teardown(function () {
    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  }),

  test('remove container', async () => {
    let imageId = await imageManager.ensureImage(IMAGE, devnull());

    let gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0; } },
      monitor: monitor,
    });

    let container = await docker.createContainer({Image: imageId});
    gc.removeContainer(container.id);
    await gc.sweep();
    assert.ok(!gc.markedContainers.length,
      'List of marked containers is not empty when it should be');
  }),

  test('remove running container', async () => {
    let imageId = await imageManager.ensureImage(IMAGE, devnull());
    let gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0; } },
      monitor: monitor,
    });

    let container = await docker.createContainer({Image: imageId,
      Cmd: ['/bin/bash', '-cvex', 'sleep 5']});
    let containerId = container.id;
    container = docker.getContainer(containerId);
    await container.start();

    gc.removeContainer(containerId);
    assert.ok(containerId in gc.markedContainers,
      'Container was not found in the list of garbage ' +
              'collected containers.');

    await gc.sweep();
    assert.ok(!(containerId in gc.markedContainers),
      'Container was found in the list of garbage ' +
              'collected containers.');
  }),

  test('container removal retry limit exceeded', async () => {
    let imageId = await imageManager.ensureImage(IMAGE, devnull());
    let gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0; } },
      monitor: monitor,
    });

    let container = await docker.createContainer({Image: imageId});
    gc.removeContainer(container.id);
    gc.markedContainers[container.id].retries = 0;
    await gc.sweep();

    assert.ok(!(container.id in gc.markedContainers),
      'Container has exceeded the retry limit but has not been ' +
              'removed from the list of marked containers.');
    assert.ok(gc.ignoredContainers.indexOf(container.id) !== -1,
      'Container has exceeded the retry limit but has not been ' +
              'added to the list of ignored containers');

    let c = docker.getContainer(container.id);
    await c.remove({force: true});
  }),

  test('remove container that does not exist', async () => {
    let imageId = await imageManager.ensureImage(IMAGE, devnull());
    let gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      taskListener: { availableCapacity: async () => { return 0; } },
      monitor: monitor,
    });

    let container = await docker.createContainer({Image: imageId});
    gc.removeContainer(container.id);

    container = docker.getContainer(container.id);
    await container.remove();

    await gc.sweep();

    assert.ok(!(container.id in gc.markedContainers),
      'Container does not exist anymore but has not been ' +
              'removed from the list of marked containers.');
  });

  test('remove marked images that are not in use', async () => {
    let gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1; } },
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5,
      containerExpiration: 5,
      monitor: monitor,
    });

    let imageName = 'busybox:ubuntu-14.04';
    let imageId = await imageManager.ensureImage(imageName, devnull());

    let container = await docker.createContainer({Image: imageId,
      Cmd: ['/bin/sh', '-c', 'ls && sleep 5']});
    container = docker.getContainer(container.id);
    await container.start();

    gc.markImage(imageId);
    await gc.sweep(true);

    assert(gc.markedImages[imageId], 'Image does not appear in list of marked images');

    await sleep(6000);
    await gc.sweep(true);
    assert(!gc.markedImages[imageId], 'Image should have been removed from marked images list');

    imageId = await getImageId(docker, imageName);
    assert.ok(!imageId, 'Image has not been removed.');
  });

  test('images are removed when expiration is reached', async () => {
    let gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1; } },
      diskspaceThreshold: 1 * 100000000,
      containerExpiration: 1,
      monitor: monitor,
    });

    let imageName = 'busybox:ubuntu-14.04';
    let imageId = await imageManager.ensureImage(imageName, devnull());

    gc.markImage(imageId);
    await gc.sweep(true);
    assert(gc.markedImages[imageId]);

    gc.markedImages[imageId] = new Date();

    await gc.sweep(true);

    imageId = await getImageId(docker, imageName);
    assert.ok(!imageId, 'Image has not been removed.');
  });

  test('unexpired images are not removed when diskspace threshold is not reached',
    async () => {
      let gc = new GarbageCollector({
        capacity: 2,
        log: debug,
        docker: docker,
        dockerVolume: '/',
        taskListener: { availableCapacity: async () => { return 1; } },
        diskspaceThreshold: 1 * 100000000,
        imageExpiration: 10000000,
        containerExpiration: 1,
        monitor: monitor,
      });

      let imageName = 'busybox:ubuntu-14.04';
      let imageId = await imageManager.ensureImage(imageName, devnull());

      gc.markImage(imageId);
      await gc.sweep(true);
      imageId = await getImageId(docker, imageName);
      assert.ok(imageId, 'Image has been removed.');

      gc.diskspaceThreshold = 500000 * 100000000;
      await gc.sweep(true);

      imageId = await getImageId(docker, imageName);
      assert.ok(!imageId, 'Image has not been removed.');
    });

  test('unexpired images are removed when diskspace threshold is reached',
    async () => {
      let gc = new GarbageCollector({
        capacity: 2,
        log: debug,
        docker: docker,
        dockerVolume: '/',
        taskListener: { availableCapacity: async () => { return 1; } },
        diskspaceThreshold: 5000000 * 100000000,
        imageExpiration: 1,
        monitor: monitor,
      });

      let imageName = 'busybox:ubuntu-14.04';
      let imageId = await imageManager.ensureImage(imageName, devnull());

      gc.markImage(imageId);
      await gc.sweep(true);

      imageId = await getImageId(docker, imageName);
      assert.ok(!imageId, 'Image has not been removed.');
    },
  );

  test('remove image that does not exist', async () => {
    let gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1; } },
      diskspaceThreshold: 1 * 100000000,
      imageExpiration: 5,
      monitor: monitor,
    });

    let imageName = 'busybox:ubuntu-14.04';
    let imageId = await imageManager.ensureImage(imageName, devnull());
    gc.markImage(imageId);

    await docker.getImage(imageId);
    await removeImage(docker, imageId);

    await gc.sweep();

    assert.ok(!(imageName in gc.markedImages),
      'Image still appears in the list of marked images');
  });

  test('clear volume cache when diskspace threshold reached', async () => {
    let gc = new GarbageCollector({
      capacity: 2,
      log: debug,
      docker: docker,
      dockerVolume: '/',
      taskListener: { availableCapacity: async () => { return 1; } },
      diskspaceThreshold: 500000 * 100000000,
      imageExpiration: 5,
      monitor: monitor,
    });

    let cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir,
      },
      log: debug,
      monitor: monitor,
      rootUrl: libUrls.testRootUrl(),
    });

    gc.addManager(cache);

    let cacheName = 'tmp-obj-dir-' + Date.now().toString();

    let instance1 = await cache.get(cacheName);
    let instance2 = await cache.get(cacheName);
    cache.set(instance2.key, {mounted: false});

    await gc.sweep();

    assert.ok(fs.existsSync(instance1.path));
    assert.ok(!fs.existsSync(instance2.path));
  });

  test('Unmarked exited containers are marked for removal when expiration reached',
    async () => {
      let imageId = await imageManager.ensureImage(IMAGE, devnull());
      let containerExpiration = 1000;

      let gc = new GarbageCollector({
        capacity: 1,
        log: debug,
        docker: docker,
        taskListener: {availableCapacity: async () => { return 0; }},
        containerExpiration: containerExpiration,
        monitor: monitor,
      });

      let container = await docker.createContainer({Image: imageId,
        Cmd: ['/bin/bash', '-c', 'echo "hello"'],
      });
      let containerId = container.id;
      container = docker.getContainer(container.id);
      await container.start();

      let removedIds = [];
      gc.on('gc:container:removed', msg => { removedIds.push(msg.id); });

      let start = Date.now();
      while (!removedIds.includes(containerId)) {
        await gc.sweep();
      }
      let stop = Date.now();
      let duration = stop - start;
      assert.ok(
        duration > containerExpiration,
        `Should have waited at least ${containerExpiration / 1000} seconds ` +
        `before marking for removal. Duration: ${duration / 1000} seconds`,
      );
    },
  );
});
