var EventEmitter = require('events').EventEmitter;
var split = require('split')
var util = require('util');

module.exports = function(stream) {
  var input = stream.pipe(split())
  var self = new EventEmitter();
  self.current = 0;

  // Format is each line must end in |N
  input.on('data', function(buffer) {
    if (buffer.length < 1) return;
    var idx = buffer.lastIndexOf('|');
    var number = parseInt(buffer.slice(idx + 1), 10)
    if (isNaN(number)) {
      self.emit(
        'error', 'Invalid number on sequence: ' + self.current  + '\n' + buffer
      );
      return
    }

    if (number != self.current++) {
      var msg = 'Out of order expected %d got %d';
      self.emit('error', util.format(msg, self.current, number));
      return
    }
    self.emit('sequence', number);
  });
  input.once('end', self.emit.bind(self, 'end'));
  return self;
};
