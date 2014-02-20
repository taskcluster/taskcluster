var Promise = require('promise');
var IronMQ = require('./ironmq');
var EventEmitter = require('events').EventEmitter;

var assert = require('assert');
var request = require('superagent-promise');
var taskrunner = require('./taskrunner');
var debug = require('debug')('taskcluster-docker-worker:ironmq');

var INTERVAL = 5000;

function Task(message, body, queue) {
  this.message = message;
  this.queue = queue;
  this.body = body;

  this.done = false;

  // give some buffer before we touch (issue it 70% the way through the timeout)
  // Remember timeout is given in seconds so we bump it up to MS
  this.touchInterval = Math.floor(message.timeout * 0.7) * 1000;
  this.touchTimeoutId = null;

  debug('touch task every', this.touchInterval, 'ms');
  this.touch().catch(function(err) {
    debug('epic fail error during touch', err);
  });
}

Task.prototype = {
  touch: function() {
    debug('being holding message', this.message.id);
    return new Promise(function(accept, reject) {
      var touch = function() {
        // safety to ensure we don't leak timers.
        if (this.done) return accept();
        debug('issue touch', this.message.id);

        this.queue.msg_touch(this.message.id).then(function(result) {
          this.touchTimeoutId = setTimeout(touch, this.touchInterval);
        }.bind(this)).catch(reject);

      }.bind(this);

      debug('initate touch');
      touch();
    }.bind(this));
  },

  run: function(docker) {
    return taskrunner(docker, this.body).then(
      function() {
        clearTimeout(this.touchTimeoutId);

        return this.queue.del(this.message.id);
      }.bind(this),
      function epicFail(err) {
        debug('epic fail!', err);
      }
    ).then(function() {
      this.done = true;
    }.bind(this));
  }
};

function IronMQConsumer(options) {
  assert(options.queue, 'has queue name');
  assert(options.docker, 'passes docker');
  assert(options.capacity, 'passes capacity');

  this.interval = options.interval || INTERVAL;
  this.capacity = options.capacity;
  this.docker = options.docker;
  this.queue = new IronMQ(options.queue);

  this.onError = this.onError.bind(this);
  this.poll = this.poll.bind(this);

  EventEmitter.call(this);
}

IronMQConsumer.prototype = {
  __proto__: EventEmitter.prototype,
  interval: 0,
  timerId: null,

  _poll: function() {
    debug('wait for message', this.interval);
    clearTimeout(this.timerId);
    this.timerId = setTimeout(this.poll, this.interval);
  },

  onError: function(err) {
    // XXX: Implement real error handling...
    debug('error processing message', err, err.stack);
  },

  poll: function() {
    // the total number of tasks we can run in parallel
    var available = this.capacity.available;
    debug('polling - current capacity', available);

    // if we can't run anything right now then wait for capacity
    if (available <= 0) {
      debug('zero capacity waiting...');
      return this.capacity.once('pop', this.poll);
    }

    debug('attempt to fetch', available, 'off the queue');

    // attempt to fetch more work
    this.queue.get({ n: available }).then(function(messages) {

      // XXX: horrible hack due to an inconsistency in how queue.get works.
      if (available === 1) {
        if (messages) {
          messages = [messages];
        } else {
          messages = [];
        }
      }

      // if no messages are available form the queue then begin polling.
      if (!messages.length) return this._poll();
      debug('popped items off the queue', messages.length);

      // promises for pending tasks
      var working = messages.map(this.handleMessage, this);

      // pass to capacity for bookkeeping.
      Promise.all(working.map(this.capacity.push, this.capacity)).then(
        null,
        // log errors that may occur for unknown reasons???
        this.onError
      );

      /**
      why poll again???

      - asking for N messages may not give all of those messages so there
        may be more in the queue.

      - we want to trigger case where we have maximum capacity and we want to
        wait for some tasks to finish.
      */
      process.nextTick(this.poll);
    }.bind(this)).then(
      null,
      this.onError
    );
  },

  stop: function() {
    clearTimeout(this.timerId);
  },

  runTask: function(body, message) {
    var task = new Task(message, body, this.queue);
    return task.run(this.docker);
  },

  handleMessage: function(message) {
    debug('handle message', message);
    var timeout = Math.ceil(message.timeout * 0.65);

    var body = JSON.parse(message.body);
    if (typeof body.task === 'object') {
      // if task is an object use it directly
      return this.runTask(body, message);
    }

    // if its not an object use it like a url
    var taskUrl = body.task;
    return request('GET', taskUrl).end().then(function(res) {
      if (!res.ok) {
        debug('epic fail failed to download task', taskUrl);
        throw new Error('failed to download url ' + taskUrl);
      }
      body.task = res.body;
      return this.runTask(body, message);
    }.bind(this));
  }
};

module.exports = IronMQConsumer;
