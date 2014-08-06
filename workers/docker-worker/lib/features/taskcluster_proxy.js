/**
This module handles the creation of the "taskcluster" proxy container which
allows tasks to talk directly to taskcluster services over a http proxy which
grants a particular permission level based on the task scopes.
*/

// Alias used to link the proxy.
var ALIAS = 'taskcluster';

function TaskclusterProxy() {}

TaskclusterProxy.prototype = {
  /**
  Docker container used in the linking process.
  */
  container: null,

  link: function* (task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.conf.get('taskclusterProxyImage');

    var assumedScope = 'assume:worker-id:' + task.runtime.workerGroup +
                       '/' + task.runtime.workerId;

    var cmd = [
        '--client-id=' + task.runtime.conf.get('taskcluster:clientId'),
        '--access-token=' + task.runtime.conf.get('taskcluster:accessToken'),
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
    var name = (yield this.container.inspect()).Name.slice(1);

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    yield this.container.start({});

    return [{ name: name, alias: ALIAS }];
  },

  killed: function*(task) {
    var stats = task.runtime.stats;
    yield stats.timeGen('tasks.time.killed_proxy', this.container.kill());
    yield stats.timeGen('tasks.time.removed_proxy', this.container.remove());
  }
};

module.exports = TaskclusterProxy;
