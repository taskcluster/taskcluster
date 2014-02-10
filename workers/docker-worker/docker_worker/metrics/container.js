var Promise = require('promise');
var EventEmitter = require('events').EventEmitter;
var keen = require('../keenio');

var TOP_ATTR_MAP = {
  USER: 'user',
  PID: 'pid',
  '%CPU': 'cpu',
  '%MEM': 'memory',
  RSS: 'rss',
  START: 'start',
  TIME: 'time',
  COMMAND: 'command'
};

/**
Build an index of the fields position by the titles property that docker returns.

@return {Object} index -> name
*/
function indexTitles(titles) {
  var result = {};
  titles.forEach(function(key, idx) {
    if (!(key in TOP_ATTR_MAP)) return;
    result[idx] = TOP_ATTR_MAP[key];
  });
  return result;
}

/**
Format top based on the list of processes and the index.

@param {Object} index (generated from indexTitles);
@param {Array} processList the array of processes returned by docker top.
@return {Array[Object]} an array of formatted process metrics.
*/
function formatTop(index, processList) {
  return processList.map(function(process) {
    var formatted = {};
    process.forEach(function(name, idx) {
      if (!index[idx]) return;
      formatted[index[idx]] = name;
    });
    return formatted;
  });
}

// every 5 seconds
var DEFAULT_INTERVAL = 5000;

function Host(name, options) {
  options = options || {};
  this.eventGroup = name;
  this.interval = options.interval || DEFAULT_INTERVAL;
  this.metrics = options.metrics || {};
  this.poll = this.poll.bind(this);
  EventEmitter.call(this);
}

Host.prototype = {
  __proto__: EventEmitter.prototype,
  _timerId: null,
  host: null,

  getMetrics: function(container) {
    return container.top({ ps_args: 'aux' }).then(
      function(top) {
        var processList = top.Processes;
        if (!this._fieldIndex) {
          this._fieldIndex = indexTitles(top.Titles);
        }

        var metrics = {
          processes: formatTop(this._fieldIndex, processList)
        };

        for (var key in this.metrics) metrics[key] = this.metrics[key];
        return metrics;
      }.bind(this)
    );
  },

  poll: function(container) {
    this.send(container).then(
      function() {
        this._timerId = setTimeout(this.poll, this.interval, container);
      }.bind(this)
    ).then(
      null,
      this.emit.bind(this, 'error')
    );
  },

  stop: function() {
    clearTimeout(this._timerId);
  },

  send: function(container) {
    return this.getMetrics(container).then(
      function(metrics) {
        return keen.addEvent(this.eventGroup, metrics);
      }.bind(this)
    );
  }
};

module.exports = Host;
