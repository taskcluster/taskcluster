const assert = require('assert');
const devnull = require('dev-null');
const VolumeCache = require('../src/lib/volume_cache');
const GarbageCollector = require('../src/lib/gc');
const {createLogger} = require('../src/lib/log');
const Debug = require('debug');
const Docker = require('../src/lib/docker');
const dockerUtils = require('dockerode-process/utils');
const waitForEvent = require('../src/lib/wait_for_event');
const fs = require('fs');
const path = require('path');
const rmrf = require('rimraf');
const cmd = require('./integration/helper/cmd');
const pipe = require('promisepipe');
const monitor = require('./fixtures/monitor');
const {suiteName} = require('taskcluster-lib-testing');
const libUrls = require('taskcluster-lib-urls');
const helper = require('./helper');

let debug = Debug('volumeCacheTest');
let docker = Docker();

suite(suiteName(), function() {
  // Location on the machine running the test where the cache will live
  let localCacheDir = path.join('/tmp', 'test-cache');

  // eslint-disable-next-line no-unused-vars
  let log = createLogger({
    source: 'top',
    provisionerId: 'test_provisioner',
    workerId: 'test_worker',
    workerGroup: 'test_worker_group',
    workerType: 'test_worker_type',
  });

  teardown(function () {
    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  });

  test('cache directories created', async () => {
    let cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir,
      },
      log: debug,
      monitor: monitor,
      rootUrl: libUrls.testRootUrl(),
    });

    let cacheName = 'tmp-obj-dir-' + Date.now().toString();

    let instance1 = await cache.get(cacheName);
    let instance2 = await cache.get(cacheName);
    let instance3 = await cache.get(cacheName);

    assert.ok(fs.existsSync(instance1.path));
    assert.ok(fs.existsSync(instance2.path));
    assert.ok(fs.existsSync(instance3.path));
    assert.ok(instance1.key !== instance2.key);
    assert.ok(instance2.key !== instance3.key);
    assert.ok(instance1.path !== instance2.path);
    assert.ok(instance2.path !== instance3.path);

    // Release clame on cached volume
    await cache.release(instance2.key);

    // Should reclaim cache directory path created by instance2
    let instance4 = await cache.get(cacheName);

    assert.ok(instance2.key === instance4.key);
    assert.ok(instance2.path === instance4.path);
  });

  test('most recently used unmounted cache instance is used', async () => {
    let cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir,
      },
      log: debug,
      monitor: monitor,
      rootUrl: libUrls.testRootUrl(),
    });

    let cacheName = 'tmp-obj-dir-' + Date.now().toString();

    let instance1 = await cache.get(cacheName); // eslint-disable-line no-unused-vars
    let instance2 = await cache.get(cacheName);
    let instance3 = await cache.get(cacheName); // eslint-disable-line no-unused-vars
    let instance4 = await cache.get(cacheName);

    // Release claim on cached volume
    await cache.release(instance4.key);
    await cache.release(instance2.key);

    // Should reclaim cache directory path created by instance2
    let instance5 = await cache.get(cacheName);

    assert.ok(instance5.key === instance2.key);
    assert.ok(instance5.path === instance2.path);
    assert.ok(instance5.lastUsed >= instance2.lastUsed);
  });

  test('invalid cache name is rejected', async () => {
    let cacheName = 'tmp-obj::dir-' + Date.now().toString();

    let fullPath = path.join(localCacheDir, cacheName);

    let cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir,
      },
      log: debug,
      monitor: monitor,
      rootUrl: libUrls.testRootUrl(),
    });

    try {
      await cache.get(cacheName);
      assert(false, 'Error should have been thrown when retrieving invalid cache name');
    } catch(e) {
      assert.ok(!fs.existsSync(fullPath),
        'Volume cache created cached volume directory when it should not ' +
        'have.',
      );
    }
  });

  test('purge volume cache', async () => {
    let cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir,
      },
      log: debug,
      monitor: monitor,
      rootUrl: libUrls.testRootUrl(),
    });

    let cacheName = 'tmp-obj-dir-' + Date.now().toString();

    let instance1 = await cache.get(cacheName);
    let instance2 = await cache.get(cacheName);

    await cache.release(instance1.key);

    let futurePurgeDate = new Date();
    futurePurgeDate.setHours(futurePurgeDate.getHours() + 5);

    // should remove only instance1
    cache.purge(cacheName, futurePurgeDate);

    let instance3 = await cache.get(cacheName);
    assert.notEqual(instance3.key, instance1.key);

    await cache.release(instance2.key);
    await cache.release(instance3.key);

    cache.purge(cacheName, futurePurgeDate);

    let instance4 = await cache.get(cacheName);

    assert.notEqual(instance4.key, instance3.key);
    assert.notEqual(instance4.key, instance2.key);

    instance1 = await cache.get(cacheName);
    cache.purge(cacheName, futurePurgeDate);
    await cache.release(instance1.key);

    // Cannot return a volume marked for purge
    instance2 = await cache.get(cacheName);
    assert.notEqual(instance1.key, instance2.key);
  });

  test('purge volume cache instance', async () => {
    // After purging an instance of a cache, future requests for that cache
    // return new instances.
    let cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir,
      },
      log: debug,
      monitor: monitor,
      rootUrl: libUrls.testRootUrl(),
    });

    let cacheName = 'tmp-obj-dir-' + Date.now().toString();

    let purgedInstance = await cache.get(cacheName);

    await cache.purgeInstance(purgedInstance.key);
    await cache.release(purgedInstance.key);

    let freshInstance = await cache.get(cacheName);
    assert.notEqual(freshInstance.key, purgedInstance.key);
  });

  helper.secrets.mockSuite('with docker', ['docker'], function(mock, skipping) {
    if (mock) {
      return; // test requires docker
    }
    test('cache directory mounted in container', async () => {
      let cacheName = 'tmp-obj-dir-' + Date.now().toString();

      let cache = new VolumeCache({
        cache: {
          volumeCachePath: localCacheDir,
        },
        log: debug,
        monitor: monitor,
        rootUrl: libUrls.testRootUrl(),
      });

      let gc = new GarbageCollector({
        capacity: 1,
        log: debug,
        docker: docker,
        interval: 2 * 1000,
        monitor: monitor,
        taskListener: { availableCapacity: async () => { return 0; } },
      });

      clearTimeout(gc.sweepTimeoutId);

      let cacheInstance = await cache.get(cacheName);

      let c = cmd(
        'echo "foo" > /docker_cache/tmp-obj-dir/blah.txt',

      );

      let pullStream = dockerUtils.pullImageIfMissing(docker, 'taskcluster/test-ubuntu:latest');
      await pipe(pullStream, devnull());

      let createConfig = {
        Image: 'taskcluster/test-ubuntu:latest',
        Cmd: c,
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        HostConfig: {
          Binds: [cacheInstance.path + ':/docker_cache/tmp-obj-dir/'],
        },
      };

      let create = await docker.createContainer(createConfig);

      let container = docker.getContainer(create.id);
      let stream = await container.attach({stream: true, stdout: true, stderr: true});
      stream.pipe(process.stdout);

      await container.start({});
      gc.removeContainer(create.id);
      gc.sweep();
      await waitForEvent(gc, 'gc:container:removed');

      assert.ok(fs.existsSync(path.join(cacheInstance.path, 'blah.txt')));
    });
  });
});
