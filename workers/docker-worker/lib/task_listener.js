/**
Primary interface which handles listening for messages and initializing the
execution of tasks.
*/

var QUEUE_PREFIX = 'worker/v1/';

var debug = require('debug')('docker-worker:task-listener');
var taskcluster = require('taskcluster-client');
var coPromise = require('co-promise');
var co = require('co');
var request = require('superagent-promise');

var Task = require('./task');
var EventEmitter = require('events').EventEmitter;

/**
@param {Configuration} config for worker.
*/
function TaskListener(runtime) {
  this.runtime = runtime;
  EventEmitter.call(this);
}

TaskListener.prototype = {
  __proto__: EventEmitter.prototype,

  /**
  Number of running tasks...
  */
  pending: 0,

  connect: function* () {
    this.runtime.log('listener connect');

    var self = this;
    var queue = this.runtime.queue;

    // Share the queue between all workerTypes of the same provisioner.
    var queueName =
      QUEUE_PREFIX + this.runtime.provisionerId + '/' + this.runtime.workerType;

    var queueEvents = new taskcluster.QueueEvents();

    // Build the listener.
    var listener = this.listener = new taskcluster.PulseListener({
      prefetch:     this.runtime.capacity,
      credentials:  this.runtime.pulse,
      // Share the queue between all provisonerId + workerTypes.
      queueName:    queueName
      // TOOD: Consider adding maxLength.
    });

    yield listener.bind(queueEvents.taskPending({
      workerType: this.runtime.workerType,
      provisionerId: this.runtime.provisionerId
    }));

    debug('bind task pending', {
      workerType: this.runtime.workerType,
      provisionerId: this.runtime.provisionerId
    });

    debug('listen', { queueName: listener._queueName, capacity: this.runtime.capacity });
    var channel = yield listener.connect();

    // Rather then use `.consume` on the listener directly we use the channel
    // directly for greater control over the flow of messages.
    yield channel.consume(listener._queueName, co(function* (msg) {
      self.runtime.log('listener begin consume');
      var content;
      try {
        self.incrementPending();
        // All content from taskcluster should be a json payload.
        content = JSON.parse(msg.content);
        yield self.runTask(content);
        channel.ack(msg);
        // Only indicate a completed task (which may trigger an idle state)
        // after an ack/nack.
        self.decrementPending();
      } catch (e) {
        if (content) {
          self.runtime.log('task error', {
            taskId: content.status.taskId,
            runId: content.runId,
            message: e.toString(),
            stack: e.stack,
            err: e
          });
        } else {
          self.runtime.log('task error', {
            message: e.toString(),
            err: e
          });
        }
        var nack = channel.nack(msg, false, false);
        // Ensure we don't leak pending references.
        self.decrementPending();
      }
    }));
  },

  close: function* () {
    return yield this.listener.close();
  },

  /**
  Halt the flow of incoming tasks (but handle existing ones).
  */
  pause: function* () {
    return yield this.listener.pause();
  },

  /**
  Resume the flow of incoming tasks.
  */
  resume: function* () {
    return yield this.listener.resume();
  },

  isIdle: function() {
    return this.pending === 0;
  },

  incrementPending: function() {
    // After going from an idle to a working state issue a 'working' event.
    if (++this.pending === 1) {
      this.emit('working', this);
    }
  },

  decrementPending: function() {
    this.pending--;
    if (this.pending === 0) {
      this.emit('idle', this);
    }
  },

  /**
  Handle the incoming message that a task is now pending.
  */
  runTask: function* (payload) {
    // Current task status.
    var runId = payload.runId;
    var status = payload.status;
    this.runtime.log('run task', { taskId: status.taskId, runId: runId });

    // Date when the task was created.
    var created = new Date(status.created);

    // Only record this value for first run!
    if (!status.runs.length) {
      // Record a stat which is the time between when the task was created and
      // the first time a worker saw it.
      this.runtime.stats.time('tasks.time.to_reach_worker', created);
    }

    // Fetch full task definition.
    var task = yield this.runtime.queue.getTask(status.taskId);

    // Create "task" to handle all the task specific details.
    var taskHandler = new Task(this.runtime, runId, task, status);

    // Run the task and collect runtime metrics.
    return yield* this.runtime.stats.timeGen(
      'tasks.time.total', taskHandler.claimAndRun()
    );
  }
};

module.exports = TaskListener;
