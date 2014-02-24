var debug = require('debug')('taskcluster-docker-worker:capacity');
var EventEmitter = require('events').EventEmitter;

/**
Object which represents the overall capacity of a worker. Keeps track of ongoing work.

@param {Number} maximumSize maximum items that should be in this object.
*/
function Capacity(maximumSize) {
  this.maximumSize = maximumSize;
  this._pop = this._pop.bind(this);

  EventEmitter.call(this);
}

Capacity.prototype = {
  __proto__: EventEmitter.prototype,

  /**
  @type Number Maximum items allowed in this structure.
  */
  maximumSize: 0,

  /**
  @type Number current length of the queue
  */
  size: 0,

  get available() {
    return this.maximumSize - this.size;
  },

  /**
  Increase the capacity (size) and emit an event about it.
  */
  _pop: function() {
    this.size--;
    debug('pop', this.size);
    this.emit('pop');
  },

  /**
  Track an item of work (promise) and reduce the capacity by one.

  @param {Promise} promise to be tracked.
  */
  push: function(promise) {
    this.size++;
    debug('push', this.size);
    return promise.then(this._pop, this._pop);
  }
};

module.exports = Capacity;

