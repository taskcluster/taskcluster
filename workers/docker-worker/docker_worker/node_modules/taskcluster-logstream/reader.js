var HttpStreams = require('./http_streams_stream');
var stream = require('stream');

function reader(url, options) {
  var httpStreams = new HttpStreams(url, options);
  var output = new stream.PassThrough();
  var ended = false;

  httpStreams.once('end', function() {
    ended = true;

    // kick off a final read to end the stream.
    httpStreams.read(0);
  });

  // XXX: the algorithm here is probably suboptimal in terms of memory
  // consumption.

  function consumeStream() {
    var stream = httpStreams.read();

    // if there is no stream there are two possible options
    if (!stream) {
      // it has ended in which case we end the output stream
      if (ended) {
        return output.end();
      }

      // or it is waiting for more streams
      return httpStreams.once('readable', consumeStream);
    }

    stream.pipe(output, { end: false });
    stream.once('end', consumeStream);
  }

  // kick off our initial read.
  consumeStream();

  return output;
}

module.exports = reader;
