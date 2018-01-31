var Promise = require('promise');
var net = require('net');

// Wait for the port to be available at a particular host/port...
function waitForPort(host, port, timeout) {
  return new Promise(function(accept, reject) {
    var deadline = Date.now() + timeout;

    function connect() {
      if (Date.now() >= deadline) {
        return reject(new Error('timed out while opening connection'));
      }
      var sock = net.connect(port, host, function() {
        sock.destroy();
        accept();
      });
      sock.once('error', function() {
        process.nextTick(connect);
      });
    }
    connect();
  });
}

module.exports = waitForPort;
