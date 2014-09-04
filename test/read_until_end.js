var Promise = require('promise');

module.exports = function readUntilEnd(req) {
  return new Promise(function(accept, reject) {
    req.once('response', function(stream) {
      if (stream.statusCode !== 200) {
        stream.resume();
        return reject(new Error("Error code other then 200"));
      }

      var buffer = '';
      stream.on('data', function(b) {
        buffer += b;
      });
      stream.once('error', reject)
      stream.once('end', function() {
        accept(buffer);
      });
    });
  });
}
