/**
Holds all runtime configuration options for the worker with various convenience 
methods.
*/
var assert = require('assert');

function Runtime(options) {
  assert(typeof options === 'object', 'options must be an object.');
  for (var key in options) this[key] = options[key];

  // Ensure capacity is always a number.
  if (this.capacity) this.capacity = parseInt(this.capacity, 10);
}

Runtime.prototype = {
  /**
  Dockerode instance.

  @type {Dockerode}
  */
  docker: null,

  /**
  Authenticated queue instance.

  @type {taskcluster.Queue}
  */
  queue: null,

  /**
  Pulse credentials `{username: '...', password: '...'}`

  @type {Object}
  */
  pulse: null,

  /**
  Capacity of the worker.

  @type {Number}
  */
  capacity: 0,

  /**
  Identifier for this worker.

  @type {String}
  */
  workerId: null,

  /**
  Type of the current worker.

  @type {String}
  */
  workerType: null,

  /**
  Which group of workers this worker belongs to.
  @type {String}
  */
  workerGroup: null,

  /**
  The provisioner who is responsible for this worker.
  */
  provisionerId: null,

  /**
  Host instance
  */
  hostManager: null
};

module.exports = Runtime;
