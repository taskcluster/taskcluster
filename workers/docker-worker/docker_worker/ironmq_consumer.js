var Promise = require('promise');
var IronMQ = require('./ironmq');
var EventEmitter = require('events').EventEmitter;

var assert = require('assert');
var taskrunner = require('./taskrunner');
var debug = require('debug')('taskcluster-docker-worker:ironmq');

var INTERVAL = 5000;

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

  handleMessage: function(message) {
    debug('handle message', message);

    var id = message.id;
    var body = JSON.parse(message.body);

    return taskrunner(this.docker, body).then(
      function() {
        return this.queue.del(id);
      }.bind(this),
      function epicFail(err) {
        debug('epic fail!', err);
      }
    );
  }
};

module.exports = IronMQConsumer;
