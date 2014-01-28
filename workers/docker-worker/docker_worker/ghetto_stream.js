/**
Simple stream which buffers _all_ the data as a string 
(appending it to the .text property)

XXX: If this was not obvious don't use this for production its mostly for testing.
*/
var stream = require('stream');

module.exports = function ghetto() {
  var passStream = new stream.PassThrough();
  passStream.text = '';

  passStream.on('data', function(value) {
    passStream.text += value.toString();
  });

  return passStream;
};
