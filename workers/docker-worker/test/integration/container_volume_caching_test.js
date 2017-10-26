const assert = require('assert');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const fs = require('fs');
const rmrf = require('rimraf');
const path = require('path');
const testworker = require('../post_task');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const waitForEvent = require('../../src/lib/wait_for_event');
const taskcluster = require('taskcluster-client');
const slugid = require('slugid');

suite('volume cache tests', () => {

  var localCacheDir = path.join(__dirname, '..', 'tmp');
  var volumeCacheDir = path.join('/', 'worker', '.test', 'tmp');

  var purgeCache;

  setup(() => {
    purgeCache = new taskcluster.PurgeCache({
      credentials: {
        clientId: process.env.TASKCLUSTER_CLIENT_ID,
        accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN
      }
    });
  });

  teardown(() => {
    settings.cleanup();

    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  });

  test('mount cached volume in docker worker', async () => {
    var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var neededScope = 'docker-worker:cache:' + cacheName;
    var fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: localCacheDir
      }
    });

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'ls /tmp-obj-dir'
        ),
        features: {
          localLiveLog: true
        },
        cache: {},
        maxRunTime:         5 * 60
      },
      scopes: [neededScope]
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    var result = await testworker(task);

    // Get task specific results
    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');
    assert.ok(result.log.indexOf(cacheName) !== -1, 'lists cache');
    assert.ok(result.log.indexOf(cacheName) !== -1, '/tmp-obj-dir');

    var objDir = fs.readdirSync(fullCacheDir);
    assert.ok(fs.existsSync(path.join(fullCacheDir, objDir[0], 'foo.txt')));
  });

  test('mount cached volume in docker worker using role', async () => {
    // This is the same as the regular success case but instead it uses roles
    // instead of an explicit scope for the cache
    var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: localCacheDir
      }
    });

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'ls /tmp-obj-dir'
        ),
        features: {
          localLiveLog: true
        },
        cache: {},
        maxRunTime: 5 * 60
      },
      scopes: ['assume:project:taskcluster:worker-test-scopes']
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    var result = await testworker(task);

    // Get task specific results
    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');
    assert.ok(result.log.indexOf(cacheName) !== -1, 'lists cache');
    assert.ok(result.log.indexOf(cacheName) !== -1, '/tmp-obj-dir');

    var objDir = fs.readdirSync(fullCacheDir);
    assert.ok(fs.existsSync(path.join(fullCacheDir, objDir[0], 'foo.txt')));
  });

  test('mounted cached volumes are not reused between tasks', async () => {
    var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var neededScope = 'docker-worker:cache:' + cacheName;

    settings.configure({
      cache: {
        volumeCachePath: localCacheDir
      },
      capacity: 2,
    });

    var worker = new TestWorker(DockerWorker);
    await worker.launch();

    var tasks = [];

    for (var i = 0; i < 2; i++) {
      var fileName = 'file' + i.toString() + '.txt';
      var task = {
        payload: {
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "foo" > /tmp-obj-dir/' + fileName,
            'sleep 10',
            'ls -lah /tmp-obj-dir'
          ),
          features: {
            // No need to actually issue live logging...
            localLiveLog: true
          },
          cache: {},
          maxRunTime: 60 * 60
        },
        scopes: [neededScope]
      };
      task.payload.cache[cacheName] = '/tmp-obj-dir';

      tasks.push(worker.postToQueue(task));
    }

    var results = await Promise.all(tasks);
    await worker.terminate();

    assert.ok(results.length === 2);
    assert.ok(results[0].log.indexOf('file0.txt') !== -1);
    assert.ok(results[0].log.indexOf('file1.txt') === -1);
    assert.ok(results[1].log.indexOf('file1.txt') !== -1);
    assert.ok(results[1].log.indexOf('file0.txt') === -1);
  });

  test('cached volumes can be reused between tasks', async () => {
    var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var fullCacheDir = path.join(localCacheDir, cacheName);
    var neededScope = 'docker-worker:cache:' + cacheName;

    settings.configure({
      cache: {
        volumeCachePath: localCacheDir
      },
      capacity: 2,
      capacityManagement: {
        diskspaceThreshold: 1
      },
      garbageCollection: {
        imageExpiration: 2 * 60 * 60 * 1000,
        interval: 5000,
        dockerVolume: '/mnt'
      },
    });

    var worker = new TestWorker(DockerWorker);
    await worker.launch();

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "This is a shared file." > /tmp-obj-dir/foo.txt'
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
        },
        cache: {},
        maxRunTime:         5 * 60
      },
      scopes: [neededScope]
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    var result1 = await Promise.all([
      worker.postToQueue(task),
      waitForEvent(worker, 'cache volume release')
    ]);
    result1 = result1[0];

    task.payload.command = cmd('cat /tmp-obj-dir/foo.txt');
    task.payload.features.localLiveLog = true;

    var result2 = await worker.postToQueue(task);
    await worker.terminate();

    assert.equal(result2.run.state, 'completed');
    assert.equal(result2.run.reasonResolved, 'completed');
    assert.ok(result2.log.indexOf('This is a shared file') !== -1);
  });

  test('mount multiple cached volumes in docker worker', async () => {
    var cacheName1 = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var cacheName2 = 'docker-worker-garbage-caches-tmp-obj-dir-' + (Date.now()+1).toString();

    var neededScopes = [];
    neededScopes.push('docker-worker:cache:' + cacheName1);
    neededScopes.push('docker-worker:cache:' + cacheName2);

    var fullCache1Dir = path.join(localCacheDir, cacheName1);
    var fullCache2Dir = path.join(localCacheDir, cacheName2);

    settings.configure({
      cache: {
        volumeCachePath: localCacheDir
      }
    });

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir1/foo.txt',
          'echo "bar" > /tmp-obj-dir2/bar.txt'
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
        },
        cache: {},
        maxRunTime:         5 * 60
      },
      scopes: neededScopes
    };

    task.payload.cache[cacheName1] = '/tmp-obj-dir1';
    task.payload.cache[cacheName2] = '/tmp-obj-dir2';

    var result = await testworker(task);

    // Get task specific results
    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');

    var objDir = fs.readdirSync(fullCache1Dir);
    assert.ok(fs.existsSync(path.join(fullCache1Dir, objDir[0], 'foo.txt')));

    objDir = fs.readdirSync(fullCache2Dir);
    assert.ok(fs.existsSync(path.join(fullCache2Dir, objDir[0], 'bar.txt')));
  });

  test('task unsuccesful when insufficient cache scope is provided',
    async () => {
      var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
      var neededScope = 'docker-worker:cache:docker-worker-garbage-caches-1' + cacheName;
      var fullCacheDir = path.join(localCacheDir, cacheName);

      var task = {
        payload: {
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "foo" > /tmp-obj-dir/foo.txt'
          ),
          cache: {},
          maxRunTime:         5 * 60
        },
        scopes: [neededScope]
      };

      task.payload.cache[cacheName] = '/tmp-obj-dir';

      var result = await testworker(task);

      // Get task specific results
      assert.equal(result.run.state, 'failed',
        'Task completed successfully when it should not have.');
      assert.equal(result.run.reasonResolved, 'failed',
        'Task completed successfully when it should not have.');

      var expectedError = 'Insufficient scopes to attach cache volumes.';
      assert.ok(result.log.indexOf(expectedError) !== -1,
        'Insufficient scopes error message did not appear in the log'
      );

      assert.ok(!fs.existsSync(fullCacheDir),
        'Volume cache created cached volume directory when it should not ' +
        'have.'
      );
    }
  );

  test('task unsuccesful when invalid cache name is requested',
    async () => {
      var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir::-' + Date.now().toString();
      var neededScope = 'docker-worker:cache:' + cacheName;
      var fullCacheDir = path.join(localCacheDir, cacheName);

      var task = {
        payload: {
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "foo" > /tmp-obj-dir/foo.txt'
          ),
          features: {
            // No need to actually issue live logging...
            localLiveLog: true
          },
          cache: {},
          maxRunTime:         5 * 60
        },
        scopes: [neededScope]
      };

      task.payload.cache[cacheName] = '/tmp-obj-dir';

      var result = await testworker(task);

      // Get task specific results
      assert.equal(result.run.state, 'failed',
        'Task completed successfully when it should not have.');
      assert.equal(result.run.reasonResolved, 'failed',
        'Task completed successfully when it should not have.');

      var expectedError = 'Error: Invalid key name was provided';
      assert.ok(result.log.indexOf(expectedError) !== -1,
        'Invalid key name message did not appear in the logs'
      );

      assert.ok(!fs.existsSync(fullCacheDir),
        'Volume cache created cached volume directory when it should not ' +
        'have.'
      );
    }
  );

  test('cached volumes of aborted tasks are released', async () => {
    var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var neededScope = 'docker-worker:cache:' + cacheName;
    var fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: localCacheDir
      },
      capacityManagement: {
        diskspaceThreshold: 1
      },
      garbageCollection: {
        imageExpiration: 2 * 60 * 60 * 1000,
        interval: 5000,
        dockerVolume: '/mnt'
      },
    });

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'sleep 60'
        ),
        features: {
          localLiveLog: true
        },
        cache: {},
        maxRunTime: 10
      },
      scopes: [neededScope]
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    var worker = new TestWorker(DockerWorker);
    await worker.launch();

    worker.postToQueue(task);
    await waitForEvent(worker, 'task max runtime timeout');
    var releasedVolume = await waitForEvent(worker, 'cache volume release');
    assert.ok(
      releasedVolume.key.indexOf(cacheName) !== -1,
      'Cached volume was not released'
    );
    await worker.terminate();
  });

  test('purge cache after run task', async () => {
    var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var neededScope = 'docker-worker:cache:' + cacheName;
    var fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: volumeCacheDir
      },
      garbageCollection: {
        interval: 100
      }
    });

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'ls /tmp-obj-dir'
        ),
        features: {
          localLiveLog: true
        },
        cache: {},
        maxRunTime:         5 * 60
      },
      scopes: [neededScope]
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue(task);

    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');

    await Promise.all([
      purgeCache.purgeCache(
        worker.provisionerId,
        worker.workerType, {
          cacheName: cacheName
      }),
      waitForEvent(worker, 'cache volume removed')
    ]);

    await worker.terminate();

    try {
      assert.equal(fs.readdirSync(fullCacheDir).length, 0);
    } catch(e) {
    }
  });

  test('purge cache during run task', async () => {
    var cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    var neededScope = 'docker-worker:cache:' + cacheName;
    var fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: volumeCacheDir
      },
      garbageCollection: {
        interval: 100
      }
    });

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'sleep 30'
        ),
        features: {
          localLiveLog: true
        },
        cache: {},
        maxRunTime:         5 * 60
      },
      scopes: [neededScope]
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let worker = new TestWorker(DockerWorker);

    var task_ran = false;
    worker.on('task run', async () => {
      await Promise.all([
        purgeCache.purgeCache(
          worker.provisionerId,
          worker.workerType, {
            cacheName: cacheName
        }),
        waitForEvent(worker, 'cache volume removed')
      ]);

      task_ran = true;
    });

    await worker.launch();
    let result = await worker.postToQueue(task);

    assert.equal(result.run.state, 'completed', 'Task state is not successful');
    assert.equal(result.run.reasonResolved, 'completed', 'Task failed');

    await worker.terminate();

    assert.ok(task_ran, 'Task did not run?!?1');
    try {
      assert.equal(fs.readdirSync(fullCacheDir).length, 0, 'Caches should have been purge');
    } catch (e) {
      // depending on the node version and the alignment of Moon, Earth and Sun,
      // the readddir call may either return an empty list of directories or
      // throw an ENOENT exception
      assert.equal(e.code, 'ENOENT');
    }
  });
});
