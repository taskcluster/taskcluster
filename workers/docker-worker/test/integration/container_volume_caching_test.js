suite('volume cache tests', function () {
  var settings = require('../settings');
  var co = require('co');
  var cmd = require('./helper/cmd');
  var fs = require('fs');
  var rmrf = require('rimraf');
  var path = require('path');
  var testworker = require('../post_task');
  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');
  var waitForEvent = require('../../lib/wait_for_event');

  var localCacheDir = path.join(__dirname, '..', 'tmp');

  teardown(function () {
    settings.cleanup();

    if (fs.existsSync(localCacheDir)) {
      rmrf.sync(localCacheDir);
    }
  });

  test('mount cached volume in docker worker', co(function* () {
    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
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

    var result = yield testworker(task);

    // Get task specific results
    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');
    assert.ok(result.log.indexOf(cacheName) !== -1, 'lists cache');
    assert.ok(result.log.indexOf(cacheName) !== -1, '/tmp-obj-dir');

    var objDir = fs.readdirSync(fullCacheDir);
    assert.ok(fs.existsSync(path.join(fullCacheDir, objDir[0], 'foo.txt')));
  }));

  test('mounted cached volumes are not reused between tasks', co(function* () {
    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    var neededScope = 'docker-worker:cache:' + cacheName;

    settings.configure({
      cache: {
        volumeCachePath: localCacheDir
      },
      capacity: 2,
    });

    var worker = new TestWorker(DockerWorker);
    yield worker.launch();

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

    var results = yield tasks;
    yield worker.terminate();

    assert.ok(results.length === 2);
    assert.ok(results[0].log.indexOf('file0.txt') !== -1);
    assert.ok(results[0].log.indexOf('file1.txt') === -1);
    assert.ok(results[1].log.indexOf('file1.txt') !== -1);
    assert.ok(results[1].log.indexOf('file0.txt') === -1);
  }));

  test('cached volumes can be reused between tasks', co(function* () {
    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
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
    yield worker.launch();

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

    var result1 = yield [
      worker.postToQueue(task),
      waitForEvent(worker, 'cache volume release')
    ];
    result1 = result1[0];

    task.payload.command = cmd('cat /tmp-obj-dir/foo.txt');
    task.payload.features.localLiveLog = true;

    var result2 = yield worker.postToQueue(task);
    yield worker.terminate();

    assert.equal(result2.run.state, 'completed');
    assert.equal(result2.run.reasonResolved, 'completed');
    assert.ok(result2.log.indexOf('This is a shared file') !== -1);
  }));

  test('mount multiple cached volumes in docker worker', co(function* () {
    var cacheName1 = 'tmp-obj-dir-' + Date.now().toString();
    var cacheName2 = 'tmp-obj-dir-' + (Date.now()+1).toString();

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

    var result = yield testworker(task);

    // Get task specific results
    assert.equal(result.run.state, 'completed');
    assert.equal(result.run.reasonResolved, 'completed');

    var objDir = fs.readdirSync(fullCache1Dir);
    assert.ok(fs.existsSync(path.join(fullCache1Dir, objDir[0], 'foo.txt')));

    objDir = fs.readdirSync(fullCache2Dir);
    assert.ok(fs.existsSync(path.join(fullCache2Dir, objDir[0], 'bar.txt')));
  }));

  test('task unsuccesful when insufficient cache scope is provided',
    co(function* () {
      var cacheName = 'tmp-obj-dir-' + Date.now().toString();
      var neededScope = 'docker-worker:cache:1' + cacheName;
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

      var result = yield testworker(task);

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
    })
  );

  test('task unsuccesful when invalid cache name is requested',
    co(function* () {
      var cacheName = 'tmp-obj-dir::-' + Date.now().toString();
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

      var result = yield testworker(task);

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
    })
  );

  test('cached volumes of aborted tasks are released', co(function* () {
    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
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
    yield worker.launch();

    worker.postToQueue(task);
    yield waitForEvent(worker, 'task max runtime timeout');
    var releasedVolume = yield waitForEvent(worker, 'cache volume release');
    assert.ok(
      releasedVolume.key.indexOf(cacheName) !== -1,
      'Cached volume was not released'
    );
    yield worker.terminate();
  }));
});
