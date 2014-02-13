var Promise = require('promise');
var request = require('superagent-promise');
var debug = require('debug')('taskcluster-docker-worker:taskapi');

function RequestAPI(options) {
  this.task = options.task;
  this.start = options.start;
  this.stop = options.stop;
}

RequestAPI.prototype = {
  /**
  Full task definition of this request.

  @type Object
  */
  task: null,

  /**
  start URL to accept the task.

  @type String
  */
  start: null,

  /**
  stop URL to send the response to.

  @type String
  */
  stop: null,

  /**
  Send a start to the requester.

  @param {Object} payload for the start request.
  @return Promise
  */
  sendStart: function(payload) {
    payload = payload || {};
    debug('send start', this.start, payload);
    // post with no content
    return request('POST', this.start)
      .send(payload)
      .end();
  },

  /**
  Send the finalized version of the task to the requester.

  @param {Object} payload for the stop request.
  @return Promise
  */
  sendStop: function(result) {
    result = result || {};
    debug('send stop', this.stop);
    return request('POST', this.stop)
      .send(result)
      .end();
  }
};

module.exports = RequestAPI;
