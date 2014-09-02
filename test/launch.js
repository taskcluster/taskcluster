// Launch the process... We rely on go to be present here...

var Promise = require('promise');
var spawn = require('child_process').spawn;
var net = require('net');

var MAIN = __dirname + '/../main.go';

module.exports = function launch() {
  return new Promise(function(accept, reject) {
    var proc = spawn(__dirname + '/../continuous-log-serve', [], {
      env: process.env,
      stdio: 'inherit'
    });

    // Handle any startup errors...
    proc.on('error', reject);

    var api = {
      kill: function() {
        return new Promise(function(accept) {
          proc.once('exit', accept);
          proc.once('error', reject)
          proc.kill();
        });
      }
    };

    function connect() {
      var sock = net.connect(60022, function() {
        proc.removeListener('error', reject);
        sock.destroy();
        accept(api);
      });
      sock.once('error', connect);
    }
    // Wait until the socket is open...
    connect()
  });
}
