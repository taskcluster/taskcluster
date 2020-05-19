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
const util = require('util');
const sleep = require('../../src/lib/util/sleep');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  let localCacheDir = '/tmp';
  let volumeCacheDir = path.join('/', 'worker', '.test', 'tmp');

  let purgeCache;

  setup(() => {
    taskcluster.config(helper.optionsFromCiCreds());
    purgeCache = new taskcluster.PurgeCache();
  });

  teardown(() => {
    settings.cleanup();

    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  });

  test('mount cached volume in docker worker', async () => {
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let neededScope = 'docker-worker:cache:' + cacheName;
    let fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: localCacheDir,
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'ls /tmp-obj-dir',
        ),
        features: {
          localLiveLog: true,
        },
        cache: {},
        maxRunTime: 5 * 60,
      },
      scopes: [neededScope],
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let result = await testworker(task);

    // Get task specific results
    const failureInfo = `log:\n${result.log}`;
    assert.equal(result.run.state, 'completed', failureInfo);
    assert.equal(result.run.reasonResolved, 'completed', failureInfo);
    assert.notEqual(result.log.indexOf(cacheName), -1, 'lists cache', failureInfo);
    assert.notEqual(result.log.indexOf(cacheName), -1, '/tmp-obj-dir', failureInfo);

    let objDir = fs.readdirSync(fullCacheDir);
    assert.ok(fs.existsSync(path.join(fullCacheDir, objDir[0], 'foo.txt')), failureInfo);
  });

  test('mount cached volume in docker worker using role', async () => {
    // This is the same as the regular success case but instead it uses roles
    // instead of an explicit scope for the cache
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: localCacheDir,
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'ls /tmp-obj-dir',
        ),
        features: {
          localLiveLog: true,
        },
        cache: {},
        maxRunTime: 5 * 60,
      },
      scopes: ['docker-worker:cache:docker-worker-garbage-caches-tmp-obj-dir*'],
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let result = await testworker(task);

    // Get task specific results
    const failureInfo = `log:\n${result.log}`;
    assert.equal(result.run.state, 'completed', failureInfo);
    assert.equal(result.run.reasonResolved, 'completed', failureInfo);
    assert.notEqual(result.log.indexOf(cacheName), -1, 'lists cache', failureInfo);
    assert.notEqual(result.log.indexOf(cacheName), -1, '/tmp-obj-dir', failureInfo);

    let objDir = fs.readdirSync(fullCacheDir);
    assert.ok(fs.existsSync(path.join(fullCacheDir, objDir[0], 'foo.txt')), failureInfo);
  });

  test('mounted cached volumes are not reused between tasks', async () => {
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let neededScope = 'docker-worker:cache:' + cacheName;

    settings.configure({
      cache: {
        volumeCachePath: localCacheDir,
      },
      capacity: 2,
    });

    let worker = new TestWorker(DockerWorker);
    await worker.launch();

    let tasks = [];

    // Wait for at least one task to start running
    const taskBarrier = waitForEvent(worker, 'task run')
      .then(async () => {
        const readdir = util.promisify(fs.readdir);
        const stat = util.promisify(fs.stat);
        const writeFile = util.promisify(fs.writeFile);

        const cachePath = path.join('/tmp', cacheName);
        let entries;

        // To make sure both tasks are running, we wait for
        // two cache entries to be created
        do {
          await sleep(500);
          entries = await readdir(cachePath);
        } while (entries.length !== 2);

        // Once the two tasks are running, we create a file
        // inside each cache to notify the tasks they can proceed
        return await Promise.all(entries.map(async (f) => {
          const cacheDir = path.join(cachePath, f);
          const fstat = await stat(cacheDir);

          if (fstat.isDirectory()) {
            await writeFile(path.join(cacheDir, 'flag'), '1');
          }
        }));
      });

    for (let i = 0; i < 2; i++) {
      let fileName = 'file' + i.toString() + '.txt';
      let task = {
        payload: {
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            '(while ! test -f /tmp-obj-dir/flag; do sleep 1; done)',
            'echo "foo" > /tmp-obj-dir/' + fileName,
            'ls -lah /tmp-obj-dir',
          ),
          features: {
            // No need to actually issue live logging...
            localLiveLog: true,
          },
          cache: {},
          maxRunTime: 60 * 60,
        },
        scopes: [neededScope],
      };
      task.payload.cache[cacheName] = '/tmp-obj-dir';

      tasks.push(worker.postToQueue(task));
    }

    await taskBarrier;
    let results = await Promise.all(tasks);
    await worker.terminate();

    assert.equal(results.length, 2);
    assert.notEqual(results[0].log.indexOf('file0.txt'), -1);
    assert.equal(results[0].log.indexOf('file1.txt'), -1);
    assert.notEqual(results[1].log.indexOf('file1.txt'), -1);
    assert.equal(results[1].log.indexOf('file0.txt'), -1);
  });

  test('cached volumes can be reused between tasks', async () => {
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let neededScope = 'docker-worker:cache:' + cacheName;

    settings.configure({
      cache: {
        volumeCachePath: localCacheDir,
      },
      capacity: 2,
      capacityManagement: {
        diskspaceThreshold: 1,
      },
      garbageCollection: {
        imageExpiration: 2 * 60 * 60 * 1000,
        interval: 5000,
        dockerVolume: '/mnt',
      },
    });

    let worker = new TestWorker(DockerWorker);
    await worker.launch();

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "This is a shared file." > /tmp-obj-dir/foo.txt',
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false,
        },
        cache: {},
        maxRunTime: 5 * 60,
      },
      scopes: [neededScope],
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    await Promise.all([
      worker.postToQueue(task),
      waitForEvent(worker, 'cache volume release'),
    ]);

    task.payload.command = cmd('cat /tmp-obj-dir/foo.txt');
    task.payload.features.localLiveLog = true;

    let result2 = await worker.postToQueue(task);
    await worker.terminate();

    assert.equal(result2.run.state, 'completed');
    assert.equal(result2.run.reasonResolved, 'completed');
    assert.ok(result2.log.indexOf('This is a shared file') !== -1);
  });

  test('mount multiple cached volumes in docker worker', async () => {
    let cacheName1 = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let cacheName2 = 'docker-worker-garbage-caches-tmp-obj-dir-' + (Date.now() + 1).toString();

    let neededScopes = [];
    neededScopes.push('docker-worker:cache:' + cacheName1);
    neededScopes.push('docker-worker:cache:' + cacheName2);

    let fullCache1Dir = path.join(localCacheDir, cacheName1);
    let fullCache2Dir = path.join(localCacheDir, cacheName2);

    settings.configure({
      cache: {
        volumeCachePath: localCacheDir,
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir1/foo.txt',
          'echo "bar" > /tmp-obj-dir2/bar.txt',
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false,
        },
        cache: {},
        maxRunTime: 5 * 60,
      },
      scopes: neededScopes,
    };

    task.payload.cache[cacheName1] = '/tmp-obj-dir1';
    task.payload.cache[cacheName2] = '/tmp-obj-dir2';

    let result = await testworker(task);

    // Get task specific results
    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');

    let objDir = fs.readdirSync(fullCache1Dir);
    assert.ok(fs.existsSync(path.join(fullCache1Dir, objDir[0], 'foo.txt')));

    objDir = fs.readdirSync(fullCache2Dir);
    assert.ok(fs.existsSync(path.join(fullCache2Dir, objDir[0], 'bar.txt')));
  });

  test('task unsuccesful when insufficient cache scope is provided',
    async () => {
      let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
      let neededScope = 'docker-worker:cache:docker-worker-garbage-caches-1' + cacheName;
      let fullCacheDir = path.join(localCacheDir, cacheName);

      let task = {
        payload: {
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "foo" > /tmp-obj-dir/foo.txt',
          ),
          cache: {},
          maxRunTime: 5 * 60,
        },
        scopes: [neededScope],
      };

      task.payload.cache[cacheName] = '/tmp-obj-dir';

      let result = await testworker(task);

      // Get task specific results
      assert.equal(result.run.state, 'failed',
        'Task completed successfully when it should not have.');
      assert.equal(result.run.reasonResolved, 'failed',
        'Task completed successfully when it should not have.');

      let expectedError = 'Insufficient scopes to attach cache volumes.';
      assert.ok(result.log.indexOf(expectedError) !== -1,
        'Insufficient scopes error message did not appear in the log',
      );

      assert.ok(!fs.existsSync(fullCacheDir),
        'Volume cache created cached volume directory when it should not ' +
        'have.',
      );
    },
  );

  test('task unsuccesful when invalid cache name is requested',
    async () => {
      let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir::-' + Date.now().toString();
      let neededScope = 'docker-worker:cache:' + cacheName;
      let fullCacheDir = path.join(localCacheDir, cacheName);

      let task = {
        payload: {
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "foo" > /tmp-obj-dir/foo.txt',
          ),
          features: {
            // No need to actually issue live logging...
            localLiveLog: true,
          },
          cache: {},
          maxRunTime: 5 * 60,
        },
        scopes: [neededScope],
      };

      task.payload.cache[cacheName] = '/tmp-obj-dir';

      let result = await testworker(task);

      // Get task specific results
      assert.equal(result.run.state, 'failed',
        'Task completed successfully when it should not have.');
      assert.equal(result.run.reasonResolved, 'failed',
        'Task completed successfully when it should not have.');

      let expectedError = 'Error: Invalid key name was provided';
      assert.ok(result.log.indexOf(expectedError) !== -1,
        'Invalid key name message did not appear in the logs',
      );

      assert.ok(!fs.existsSync(fullCacheDir),
        'Volume cache created cached volume directory when it should not ' +
        'have.',
      );
    },
  );

  test('cached volumes of aborted tasks are released', async () => {
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let neededScope = 'docker-worker:cache:' + cacheName;
    settings.configure({
      cache: {
        volumeCachePath: localCacheDir,
      },
      capacityManagement: {
        diskspaceThreshold: 1,
      },
      garbageCollection: {
        imageExpiration: 2 * 60 * 60 * 1000,
        interval: 5000,
        dockerVolume: '/mnt',
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'sleep 60',
        ),
        features: {
          localLiveLog: true,
        },
        cache: {},
        maxRunTime: 10,
      },
      scopes: [neededScope],
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let worker = new TestWorker(DockerWorker);
    await worker.launch();

    worker.postToQueue(task);
    await waitForEvent(worker, 'task max runtime timeout');
    let releasedVolume = await waitForEvent(worker, 'cache volume release');
    assert.ok(
      releasedVolume.key.indexOf(cacheName) !== -1,
      'Cached volume was not released',
    );
    await worker.terminate();
  });

  test('purge cache before run task', async () => {
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let neededScope = 'docker-worker:cache:' + cacheName;
    let fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: volumeCacheDir,
      },
      garbageCollection: {
        interval: 100,
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'ls /tmp-obj-dir',
        ),
        features: {
          localLiveLog: true,
        },
        cache: {},
        maxRunTime: 5 * 60,
      },
      scopes: [neededScope],
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let worker = new TestWorker(DockerWorker);
    await worker.launch();
    let result = await worker.postToQueue(task);

    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');

    await purgeCache.purgeCache(
      worker.provisionerId,
      worker.workerType, {
        cacheName: cacheName,
      });
    await Promise.all([
      // post a second task to trigger cache purging
      worker.postToQueue(task),
      // and wait for the purge to occur at the same time
      waitForEvent(worker, 'cache volume removed'),
    ]);

    await worker.terminate();

    assert.throws(() => fs.readdirSync(fullCacheDir), err => err.code === 'ENOENT');
  });

  test('purge cache during run task', async () => {
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let neededScope = 'docker-worker:cache:' + cacheName;
    let fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: volumeCacheDir,
      },
      garbageCollection: {
        interval: 100,
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'sleep 30',
        ),
        features: {
          localLiveLog: true,
        },
        cache: {},
        maxRunTime: 5 * 60,
      },
      scopes: [neededScope],
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let worker = new TestWorker(DockerWorker);

    let cache_purged = false;
    worker.once('task run', async () => {
      // wait until the first task has started to clear the cache
      await Promise.all([
        purgeCache.purgeCache(
          worker.provisionerId,
          worker.workerType, {
            cacheName: cacheName,
          }),
        waitForEvent(worker, 'cache volume removed'),
      ]);

      cache_purged = true;
    });

    await worker.launch();
    let result1 = await worker.postToQueue(task);
    let result2 = await worker.postToQueue(task);

    assert.equal(result1.run.state, 'completed', 'Task state is not successful');
    assert.equal(result1.run.reasonResolved, 'completed', 'Task failed');
    assert.equal(result2.run.state, 'completed', 'Task state is not successful');
    assert.equal(result2.run.reasonResolved, 'completed', 'Task failed');

    await worker.terminate();

    assert.ok(cache_purged, 'Cache purge did not occur');
    assert.throws(() => fs.readdirSync(fullCacheDir), err => err.code === 'ENOENT');
  });

  test('purge cache based on exit status', async () => {
    let cacheName = 'docker-worker-garbage-caches-tmp-obj-dir-' + Date.now().toString();
    let neededScope = 'docker-worker:cache:' + cacheName;
    let fullCacheDir = path.join(localCacheDir, cacheName);
    settings.configure({
      cache: {
        volumeCachePath: volumeCacheDir,
      },
      garbageCollection: {
        interval: 100,
      },
    });

    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt',
          'exit 36',
        ),
        features: {
          localLiveLog: true,
        },
        cache: {},
        maxRunTime: 5 * 60,
        onExitStatus: {
          purgeCaches: [36],
        },
      },
      scopes: [neededScope],
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    let worker = new TestWorker(DockerWorker);
    await worker.launch();
    let removal = waitForEvent(worker, 'cache volume removed');
    // run two tasks, with the cache volume removed between the two
    await worker.postToQueue(task),
    await worker.postToQueue(task),

    await removal;

    await worker.terminate();

    assert.throws(() => fs.readdirSync(fullCacheDir), err => err.code === 'ENOENT');
  });
});
