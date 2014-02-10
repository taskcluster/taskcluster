var rangeParser = require('range-parser');
var debug = require('debug')('task-cluster-logclient:range_frame_test');

function FrameState() {
  this.buffer = new Buffer(0);
}

FrameState.prototype = {
  FINAL_HEADER: 'x-ms-meta-complete',

  etag: null,

  complete: false,

  etagMatch: function(value) {
    if (!this.etag) return;
    return value === this.etag;
  },

  write: function(buffer) {
    this.buffer = Buffer.concat([this.buffer, buffer]);
    this.etag = this.buffer.toString('base64');
  },

  fetch: function(start) {
    start = start || 0;
    return this.buffer.slice(start);
  },

  end: function(buffer) {
    if (buffer) this.write(buffer);

    // calling end updates the etag
    this.etag = new Buffer('completed').toString('base64');
    this.complete = true;
  }
};

/**
Handles all requests for the server until the buffer is exhausted.
*/
function rangeFrame() {
  var state = new FrameState();
  var handler = function(req, res, done) {
    state.close = done;
    var headers = req.headers;
    debug('range frame begin', headers);

    // if its a HEAD reqeust set the content length in all cases
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', state.buffer.length);
    }

    // set the current etag state
    res.setHeader('Etag', state.etag);

    // check for if conditions note that 304 will not return the complete
    // header
    if (headers['if-none-match'] === state.etag) {
      debug('range etag match', state.etag);
      res.writeHead(304, {
        'Etag': state.etag
      });
      return res.end();
    }

    // if the buffer is of zero length return 404
    if (!state.buffer.length) {
      res.writeHead(404);
      return res.end();
    }

    // if completed mark as complete
    if (state.complete) {
      debug('range complete');
      res.setHeader(state.FINAL_HEADER, 1);
    }

    // check for range
    var rangeStr = headers.range;
    if (!rangeStr) {
      debug('no range string');
      // if there is no range return the entire buffer
      res.writeHead(200, {
        'Content-Length': state.buffer.length
      });

      return res.end(state.buffer);
    }

    // handle range requests
    var range = rangeParser(state.buffer.length, rangeStr)[0];

    // validate the range
    if (!range) {
      debug('invalid range string', rangeStr);
      // invalid range should never include the final header
      res.removeHeader(state.FINAL_HEADER);
      res.writeHead(416);
      return res.end();
    }

    var content = state.fetch(range.start);
    debug('ranged fetch', range, content.length);

    res.writeHead(206, {
      'Content-Length': content.length
    });

    res.end(content);
  };

  handler.state = state;
  return handler;
}

module.exports = rangeFrame;
