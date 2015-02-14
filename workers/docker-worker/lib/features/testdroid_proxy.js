var waitForPort = require('../wait_for_port');
var pullImage = require('../pull_image_to_stream');
var request = require('superagent-promise');
var debug = require('debug')('docker-worker:features:testdroid-proxy');

// Alias used to link the proxy.
var ALIAS = 'testdroid';
// Maximum time in MS to wait for socket to become available
var INIT_TIMEOUT = 5000;

function TestdroidProxy() {}

TestdroidProxy.prototype = {
  /**
  Docker container used in the linking process.
  */
  container: null,

  link: function* (task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.testdroidProxyImage;

    yield pullImage(docker, image, process.stdout);

    var cmd = [
        '--cloud-url=' + task.runtime.testdroid.url,
        '--username=' + task.runtime.testdroid.username,
        '--password=' + task.runtime.testdroid.password
    ];

    var envs = [];
    if (process.env.DEBUG) {
      envs.push('DEBUG=' + process.env.DEBUG);
    }

    // create the container.
    this.container = yield docker.createContainer({
      Image: image,
      Env: envs,
      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,

      Cmd: cmd
    });

    this.container = docker.getContainer(this.container.id);

    if (process.env.DEBUG) {
      var stream = yield this.container.attach({stream: true, stdout: true, stderr: true});
      stream.pipe(process.stdout);
    }

    yield this.container.start({});

    var inspect = yield this.container.inspect();
    var host = inspect.NetworkSettings.IPAddress;
    var name = inspect.Name.slice(1)

    try {
      // wait for the initial server response...
      debug('waiting for port');
      yield waitForPort(host, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize testdroid proxy service.')
    }

    this.host = host;
    return [{ name: name, alias: ALIAS }];
  },

  killed: function*(task) {
    debug('in testdroid proxy');
    // attempt to release the device in case task did not do so.  Calling release
    // is idempotent.
    var res = yield request.post('http://'+this.host+'/device/release').end();
    task.runtime.gc.removeContainer(this.container.id);
  }
};

module.exports = TestdroidProxy;
