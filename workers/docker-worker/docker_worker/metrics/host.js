var Promise = require('promise');
var keen = require('../keenio');
var EventEmitter = require('events').EventEmitter;

// every second
var DEFAULT_INTERVAL = 1000;

function Host(name, options) {
  this.eventGroup = name;
  this.interval = options.interval || DEFAULT_INTERVAL;
  this.metrics = options.metrics || {};
  this.poll = this.poll.bind(this);

  EventEmitter.call(this);
}

Host.prototype = {
  __proto__: EventEmitter.prototype,
  host: null,
  _timerId: null,

  getMetrics: function() {
    var metrics = {
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };

    for (var key in this.metrics) metrics[key] = this.metrics[key];
    return metrics;
  },

  poll: function() {
    this.send().then(
      function() {
        this._timerId = setTimeout(this.poll, this.interval);
      }.bind(this)
    ).then(
      null,
      this.emit.bind(this, 'error')
    );
  },

  stop: function() {
    clearTimeout(this._timerId);
  },

  send: function() {
    return keen.addEvent(this.eventGroup, this.getMetrics());
  }
};

module.exports = Host;
