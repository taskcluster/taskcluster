var net = require('net');
var Promise = require('promise');

module.exports = function connect(port) {
  return new Promise(function(accept, reject) {
    function connect() {
      var sock = net.connect(port, function() {
        sock.destroy();
        accept();
      });
      sock.once('error', connect);
    }
    connect();
  });
}
