var express = require('express');
var Promise = require('promise');
var uuid = require('uuid')

function getServer() {
  return new Promise(function(accept, reject) {
    var app = express();
    app.use(express.json());

    var server;

    function url(path) {
      var addr = server.address();
      return 'http://' + addr.address + ':' + addr.port + path;
    }

    function endpoint(method, handler) {
      var path = '/' + uuid.v4();
      app[method](path, handler);
      return url(path);
    };

    app.once('error', reject);
    server = app.listen(0, function() {
      server.endpoint = endpoint;
      accept(server);
    });
  });
}

module.exports = getServer;
