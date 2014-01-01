var Promise = require('promise'),
    dockerRun = Promise.denodeify(require('./lib/docker_run'));

/**
States for the task runner
*/
var STATES = {
  // off indicates we don't have a container yet.
  off: 0,

  // we are running when the container has been created and the task has
  // begun.
  running: 1,

  // we are done when the task has finished running.
  done: 2,

  // and finally destroyed when the container has been removed (via
  // .destroy).
  destroyed: 3
};

/**
Primary module which deals with docker (images / containers)
*/

/**
@param {Docker} docker credentials (see dockerode).
@param {Object} task structure.
*/
function TaskRunner(docker, task) {
  // credentials for the docker instance.
  this.docker = docker;

  // we save the entire task though we only need a few parts of it for
  // this operation.
  this.task = task;

  // machine specs
  var image = task.machine && task.machine.image;

  if (!image) {
    throw new Error('cannot run docker task without .machine.image type');
  }

  this.image = image;

  if (!task.command) {
    throw new Error('cannot run docker task without .command');
  }
  this.command = task.command;
}

TaskRunner.STATES = STATES;

TaskRunner.prototype = {
  state: STATES.off,

  /**
  The docker image to use for running this task.

  @type String
  */
  image: null,

  /**
  The command to execute in the container.

  @type Array
  */
  command: null,

  /**
  Docker container instance (see dockerode Container).
  */
  container: null,

  /**
  @type Object representing the result of the task run

      {
        statusCode: 1
      }
  */
  result: null,

  execute: function(outputStream) {
    var run = Promise.denodeify(this.docker.run.bind(this.docker));
    var pull = Promise.denodeify(this.docker.pull.bind(this.docker));

    var command = [
      '/bin/bash', '-c',
      this.command.join(' ')
    ];

    var execTask = function() {
      return dockerRun(
        this.docker,
        this.image,
        command,
        outputStream
      );
    }.bind(this);

    var promise = pull(this.image).then(
      function(stream) {
        return new Promise(function(accept, reject) {
          stream.once('error', reject);
          stream.once('end', accept);

          if (outputStream) {
            // don't end the outputStream because of this.
            // XXX: This stream output is super ugly right now.
            stream.pipe(outputStream, { end: false });
          }
        });
      }
    ).then(
      execTask
    ).then(
      function assignContainer(output) {
        this.state = STATES.done;
        this.container = output.container;
        this.result = {
          statusCode: output.result.StatusCode
        };
        return this.result;
      }.bind(this)
    );

    this.state = STATES.running;

    return promise;
  },

  destroy: function() {
  }
};

module.exports = TaskRunner;
