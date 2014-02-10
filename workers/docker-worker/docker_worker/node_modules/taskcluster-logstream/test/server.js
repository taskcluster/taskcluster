var http = require('http');
var debug = require('debug')('taskcluster-logclient:test-server');

/**
Testing server specifically designed for the use cases around testing the live
logging polling use case. Use one server per test case (and for each type of
test case).
*/
function Server() {
  http.Server.apply(this, arguments);
  this.on('request', this.handleRequest.bind(this));

  /**
  A "frame" is a response for one particular request.
  */
  this.frames = [];
}

Server.prototype = {
  __proto__: http.Server.prototype,
  _super: http.Server.prototype,

  /**
  Add a request frame to the end of the stack.
  @param {Function} handler (req, res).
  @return {Function} handler.
  */
  pushFrame: function(handler) {
    this.frames.push(handler);
    return handler;
  },

  /**
  Add a request frame to the beginning of the stack.
  @param {Function} handler (req, res).
  @return {Function} handler.
  */
  unshiftFrame: function(handler) {
    this.frames.unshift(handler);
    return handler;
  },

  handleRequest: function(req, res) {
    var frame = this.frames[0];
    debug('begin handle frame', !!frame);

    if (!frame) {
      res.writeHead(501);
      return res.end('invalid frame');
    }

    frame(req, res, function(err) {
      if (err) {
        return this.emit('error', err);
      }
      // remove the frame from the list
      var idx = this.frames.indexOf(frame);
      if (idx !== -1) this.frames.splice(idx, 1);
    }.bind(this));
  },

  /**
  @return String url for server.
  */
  url: function() {
    var port = this.address().port;
    return 'http://localhost:' + port;
  },

  /**
  @param {Function} callback (attaches to listening server event).
  */
  listen: function(callback) {
    this._super.listen.call(this, 0, null, null, callback);
  }
};

module.exports = Server;
