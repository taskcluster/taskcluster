suite('Docker custom private registry', function() {
  var co = require('co');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');
  var slugid = require('slugid');
  var proxy = require('./helper/proxy');
  var docker = require('../../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  var REGISTRY = 'registry.hub.docker.com';

  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  var registryProxy;
  var credentials = { username: 'user', password: 'pass', email: 'xfoo@g.com' };

  var worker;
  setup(co(function * () {
    // For interfacing with the docker registry.
    worker = new TestWorker(DockerWorker, slugid.v4(), slugid.v4());
    registryProxy = yield proxy(credentials);
  }));

  teardown(co(function* () {
    yield [worker.terminate(), registryProxy.close()];
  }));

  test('success', co(function* () {
    var imageName = registryProxy.imageName('lightsofapollo/busybox');
    var registries = {};
    registries[registryProxy.imageName('')] = credentials;
    settings.configure({ registries: registries });

    yield worker.launch();

    var result = yield worker.postToQueue({
      scopes: ['docker-worker:image:' + imageName],
      payload: {
        image: imageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });

    assert.ok(result.run.success, 'auth download works');
    assert.ok(result.log.indexOf(imageName) !== '-1', 'correct image name');
  }));

  test('success - with star', co(function* () {
    var imageName = registryProxy.imageName('lightsofapollo/busybox');
    var registries = {};
    registries[registryProxy.imageName('')] = credentials;
    settings.configure({ registries: registries });

    yield worker.launch();

    var result = yield worker.postToQueue({
      scopes: ['docker-worker:image:' + imageName.split('/')[0] + '/*'],
      payload: {
        image: imageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });

    assert.ok(result.run.success, 'auth download works');
    assert.ok(result.log.indexOf(imageName) !== '-1', 'correct image name');
  }));

  test('failed scopes', co(function* () {
    var imageName = registryProxy.imageName('lightsofapollo/busybox');

    // Ensure this credential request fails...
    var registries = {};
    registries[registryProxy.imageName('')] = credentials;
    settings.configure({ registries: registries });

    yield worker.launch();

    var result = yield worker.postToQueue({
      scopes: [],
      payload: {
        image: imageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });
    assert.ok(!result.run.success, 'auth download works');
    assert.ok(result.log.indexOf(imageName) !== '-1', 'correct image name');
  }));

  test('failed auth', co(function* () {
    var imageName = registryProxy.imageName('lightsofapollo/busybox');

    // Ensure this credential request fails...
    var registries = {};
    registries[registryProxy.imageName('')] = {
      username: 'fail', password: 'fail'
    };
    settings.configure({ registries: registries });

    yield worker.launch();

    var result = yield worker.postToQueue({
      scopes: ['docker-worker:image:' + imageName],
      payload: {
        image: imageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });

    assert.ok(!result.run.success, 'auth download works');
    assert.ok(result.log.indexOf(imageName) !== '-1', 'correct image name');
  }));

});
