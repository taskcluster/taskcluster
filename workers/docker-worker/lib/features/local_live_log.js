/**
This module handles the creation of the "taskcluster" proxy container which
allows tasks to talk directly to taskcluster services over a http proxy which
grants a particular permission level based on the task scopes.
*/

var URL = require('url');
var http = require('http');
var waitForEvent = require('../wait_for_event');
var waitForPort = require('../wait_for_port');
var pullImage = require('../pull_image_to_stream');

var BulkLog = require('./bulk_log');
var Promise = require('promise');

var ARTIFACT_NAME = 'public/logs/live.log';
var BACKING_ARTIFACT_NAME = 'public/logs/live_backing.log';
// Maximum time to wait for the put socket to become available.
var INIT_TIMEOUT = 2000;

var debug = require('debug')(
  'taskcluster-docker-worker:features:local_live_log'
);

// Alias used to link the proxy.
function TaskclusterLogs() {
  this.bulkLog = new BulkLog(BACKING_ARTIFACT_NAME);
}

TaskclusterLogs.prototype = {
  /**
  Docker container used in the linking process.
  */
  container: null,

  created: function* (task) {
    debug('create live log container...')
    // ensure we have a bulk log backing stuff...
    yield this.bulkLog.created(task);

    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.taskclusterLogImage;

    yield pullImage(docker, image, process.stdout);

    var envs = [];
    if (process.env.DEBUG) {
      envs.push('DEBUG=' + process.env.DEBUG);
    }

    // create the container.
    this.container = yield docker.createContainer({
      Image: image,
      Tty: false,
      Env: ["DEBUG=*"],
      //Env: envs,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      ExposedPorts: {
        '60023/tcp': {}
      }
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    yield this.container.start({
      // bind the reading side to the host so we can expose it to the world...
      PortBindings: {
        "60023/tcp": [{ HostPort: "0" }]
      }
    });
    var inspect = yield this.container.inspect();

    try {
      // wait for the initial server response...
      yield waitForPort(
        inspect.NetworkSettings.IPAddress, '60022', INIT_TIMEOUT
      );
    } catch (e) {
      task.runtime.log('Failed to connect to live log server', {
        taskId: task.status.taskId,
        runId: task.runId
      });
      // The killed method below will handle cleanup of resources...
      return
    }
    // Log PUT url is only available on the host itself
    var putUrl = 'http://' + inspect.NetworkSettings.IPAddress + ':60022/log';
    var opts = URL.parse(putUrl);
    opts.method = 'put';

    this.stream = http.request(opts);

    // Note here that even if the live logging server or upload fails we don't
    // care too much since the backing log should always work... So we basically
    // want to handle errors just enough so we don't accidentally fall over as
    // we switch to the backing log.
    this.stream.on('error', function(err) {
      task.runtime.log('Error piping data to live log', {
        err: err.toString(),
        taskId: task.status.taskId,
        runId: task.runId
      });
      task.stream.unpipe(this.stream);
    }.bind(this));
    task.stream.pipe(this.stream);

    var publicPort = inspect.NetworkSettings.Ports['60023/tcp'][0].HostPort;
    this.publicUrl = 'http://' + task.runtime.host + ':' + publicPort + '/log';
    debug('live log running', this.putUrl)

    var queue = task.runtime.queue;

    // Intentionally used the same expiration as the bulkLog
    var expiration =
      new Date(Date.now() + task.runtime.logging.bulkLogExpires);

    // Create the redirect artifact...
    yield queue.createArtifact(
      task.status.taskId,
      task.runId,
      ARTIFACT_NAME,
      {
        storageType: 'reference',
        expires: expiration,
        contentType: 'text/plain',
        url: this.publicUrl
      }
    );
  },

  killed: function*(task) {
    debug('switching live log redirect to backing log...')

    // Note here we don't wait or care for the live logging to complete
    // correctly we simply let it pass/fail to finish since we are going to kill
    // the connection anyway...

    var stats = task.runtime.stats;
    var backingUrl = yield this.bulkLog.killed(task)

    // Switch references to the new log file on s3 rather then the local worker
    // server...
    var expiration =
      new Date(Date.now() + task.runtime.logging.bulkLogExpires);

    yield task.runtime.queue.createArtifact(
      task.status.taskId,
      task.runId,
      ARTIFACT_NAME,
      {
        storageType: 'reference',
        expires: expiration,
        contentType: 'text/plain',
        url: backingUrl
      }
    );

    // Cleanup all references to the live logging server...
    yield stats.timeGen('tasks.time.killed_live_log', this.container.kill());
    yield stats.timeGen('tasks.time.removed_live_log', this.container.remove());
  }
};

module.exports = TaskclusterLogs;

