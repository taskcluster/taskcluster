// Launch the process... We rely on go to be present here...

var Promise = require('promise');
var spawn   = require('child_process').spawn;
var _       = require('lodash');
var path    = require('path');
var net     = require('net');
var waitForPort = require('./wait_for_port');

module.exports = function launch(options) {
  return new Promise(function(accept, reject) {
    options = options || {};
    var env = process.env;
    if (options.ssl) {
      env = _.defaults({
        SERVER_CRT_FILE:       path.join(__dirname, 'server.crt'),
        SERVER_KEY_FILE:       path.join(__dirname, 'server.key')
      }, env);
    }
    var proc = spawn(__dirname + '/../livelog', [], {
      env:    env,
      stdio:  'inherit'
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

    waitForPort(60022).then(function() {
      return api;
    }).then(accept, reject);
  });
}
