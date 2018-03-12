// This module is a mock version of S3UploadStream (from 's3-upload-stream' npm module).
// To be used in order to bypass unecessary calls to the S3 aws service while testing
// the Taskcluster library.

const Writable = require('stream').Writable;

function MockClient(client) {
  if (this instanceof MockClient === false) {
    return new MockClient(client);
  }
}

MockClient.prototype.upload = function(obj) {
  let stream = new Writable();

  stream._write = function(chunk, encoding, done) {
    stream.emit('part', 'Fake upload for testing purposes is in progress');
    if (!chunk) {
      stream.emit('error', 'Nothing is being piped in the stream');
    }
    done();
  };

  stream.end = function(chunk, encoding, done) {
    stream.emit('uploaded', 'Fake upload for testing purposes is done');
  };

  return stream;
};

module.exports = MockClient;
