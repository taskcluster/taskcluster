suite('volume cache test', function () {
  var VolumeCache = require('../lib/volume_cache');
  var GarbageCollector = require('../lib/gc');
  var createLogger = require('../lib/log');
  var debug = require('debug')('volumeCacheTest');
  var devnull = require('dev-null');
  var docker = require('../lib/docker')();
  var waitForEvent = require('../lib/wait_for_event');
  var fs = require('fs');
  var path = require('path');
  var mkdirp = require('mkdirp');
  var rmrf = require('rimraf');
  var co = require('co');
  var pullImage = require('../lib/pull_image_to_stream').pullImageStreamTo;
  var cmd = require('./integration/helper/cmd');

  // Location on the machine running the test where the cache will live
  var localCacheDir = path.join('/tmp', 'test-cache');

  var log = createLogger({
    source: 'top',
    provisionerId: 'test_provisioner',
    workerId: 'test_worker',
    workerGroup: 'test_worker_group',
    workerType: 'test_worker_type'
  });

  var stats = {
    record: function(stat) { return; }
  };

  var IMAGE = 'taskcluster/test-ubuntu';

  setup(co(function* () {
    yield pullImage(docker, IMAGE, devnull());
  }));

  teardown(function () {
    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  });

  test('cache directories created', co(function* () {
    var cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir
      },
      log: debug,
      stats: stats
    });

    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    var fullPath = path.join(localCacheDir, cacheName);

    var instance1 = yield cache.get(cacheName);
    var instance2 = yield cache.get(cacheName);
    var instance3 = yield cache.get(cacheName);

    assert.ok(fs.existsSync(instance1.path));
    assert.ok(fs.existsSync(instance2.path));
    assert.ok(fs.existsSync(instance3.path));
    assert.ok(instance1.key !== instance2.key);
    assert.ok(instance2.key !== instance3.key);
    assert.ok(instance1.path !== instance2.path);
    assert.ok(instance2.path !== instance3.path);

    // Release clame on cached volume
    yield cache.release(instance2.key);

    // Should reclaim cache directory path created by instance2
    var instance4 = yield cache.get(cacheName);

    assert.ok(instance2.key === instance4.key);
    assert.ok(instance2.path === instance4.path);
  }));

  test('most recently used unmounted cache instance is used', co(function* () {
    var cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir
      },
      log: debug,
      stats: stats
    });

    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    var fullPath = path.join(localCacheDir, cacheName);

    var instance1 = yield cache.get(cacheName);
    var instance2 = yield cache.get(cacheName);
    var instance3 = yield cache.get(cacheName);
    var instance4 = yield cache.get(cacheName);

    // Release claim on cached volume
    yield cache.release(instance4.key);
    yield cache.release(instance2.key);

    // Should reclaim cache directory path created by instance2
    var instance5 = yield cache.get(cacheName);

    assert.ok(instance5.key === instance2.key);
    assert.ok(instance5.path === instance2.path);
    assert.ok(instance5.lastUsed > instance2.lastUsed);
  }));


  test('cache directory mounted in container', co(function* () {
    var cacheName = 'tmp-obj-dir-' + Date.now().toString();

    var cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir
      },
      log: debug,
      stats: stats
    });

    var gc = new GarbageCollector({
      capacity: 1,
      log: debug,
      docker: docker,
      interval: 2 * 1000,
      taskListener: { availableCapacity: async () => { return 0; } }
    });

    clearTimeout(gc.sweepTimeoutId);

    var fullPath = path.join(localCacheDir, cacheName);


    var cacheInstance = yield cache.get(cacheName);

    var c = cmd(
      'echo "foo" > /docker_cache/tmp-obj-dir/blah.txt'
    );

    var createConfig = {
      Image: IMAGE,
      Cmd: c,
      AttachStdin:false,
      AttachStdout:true,
      AttachStderr:true,
      Tty: true
    };

    var create = yield docker.createContainer(createConfig);

    var container = docker.getContainer(create.id);
    var stream = yield container.attach({stream: true, stdout: true, stderr: true});
    stream.pipe(process.stdout);

    var binds = cacheInstance.path + ':/docker_cache/tmp-obj-dir/';

    var startConfig = {
      Binds: [binds],
    };

    yield container.start(startConfig);
    gc.removeContainer(create.id);
    gc.sweep();
    var removedContainerId = yield waitForEvent(gc, 'gc:container:removed');

    assert.ok(fs.existsSync(path.join(cacheInstance.path, 'blah.txt')));
  }));

  test('invalid cache name is rejected', co(function* () {
    var cacheName = 'tmp-obj::dir-' + Date.now().toString();

    var fullPath = path.join(localCacheDir, cacheName);

    var cache = new VolumeCache({
      cache: {
        volumeCachePath: localCacheDir
      },
      log: debug,
      stats: stats
    });


    assert.throws(cache.get(cacheName), Error);

    assert.ok(!fs.existsSync(fullPath),
      'Volume cache created cached volume directory when it should not ' +
      'have.'
    );
  }));
});
