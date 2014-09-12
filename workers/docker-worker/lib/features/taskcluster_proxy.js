/**
This module handles the creation of the "taskcluster" proxy container which
allows tasks to talk directly to taskcluster services over a http proxy which
grants a particular permission level based on the task scopes.
*/
var waitForPort = require('../wait_for_port');
var pullImage = require('../pull_image_to_stream');

// Alias used to link the proxy.
var ALIAS = 'taskcluster';
// Maximum time in MS to wait for the proxy socket to become available.
var INIT_TIMEOUT = 2000;

function TaskclusterProxy() {}

TaskclusterProxy.prototype = {
  /**
  Docker container used in the linking process.
  */
  container: null,

  link: function* (task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.taskclusterProxyImage;

    yield pullImage(docker, image, process.stdout);

    var assumedScope = 'assume:worker-id:' + task.runtime.workerGroup +
                       '/' + task.runtime.workerId;

    var cmd = [
        '--client-id=' + task.runtime.taskcluster.clientId,
        '--access-token=' + task.runtime.taskcluster.accessToken,
        task.status.taskId,
        assumedScope
    ];

    // create the container.
    this.container = yield docker.createContainer({
      Image: image,

      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,

      // The proxy image uses a delegating authentication pattern it accepts
      // the primary workers authentication details and a task id (which is used
      // to fetch the task and it's scopes to delegate). Note: passing the
      // arguments via 'Cmd' may potentially be a security issue. Alternatives
      // are: 1. Volume mounted files, 2. Docker secret (not landed yet).
      Cmd: cmd
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    yield this.container.start({});

    var inspect = yield this.container.inspect();
    var name = inspect.Name.slice(1)

    try {
      // wait for the initial server response...
      yield waitForPort(inspect.NetworkSettings.IPAddress, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize taskcluster proxy service.')
    }

    return [{ name: name, alias: ALIAS }];
  },

  killed: function*(task) {
    var stats = task.runtime.stats;
    yield stats.timeGen('tasks.time.killed_proxy', this.container.kill());
    yield stats.timeGen('tasks.time.removed_proxy', this.container.remove());
  }
};

module.exports = TaskclusterProxy;
