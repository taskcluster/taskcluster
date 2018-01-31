/**
Tiny helper to wait for a stream to be finished writing.
*/

var Promise = require('promise');

module.exports = function waitForStream(stream) {
  return new Promise(function(accept, reject) {
    // If the stream has a .closed property try to use this otherwise read the
    // internal writableState which is somewhat of a hack though is stable
    // between node versions...
    if (
      stream.closed || stream._writableState && stream._writableState.finished
    ) {
      return accept();
    }
    stream.once('finish', accept);
    stream.once('error', reject);
  }.bind(this));
};
