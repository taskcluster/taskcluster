var express = require('express');
var Promise = require('promise');
var uuid = require('uuid');

function getServer() {
  return new Promise(function(accept, reject) {
    var app = express();
    app.use(express.json());

    var server;

    /**
    Generate the url based on the path (and optionally an override host)

    @param {String} path for url.
    @param {String} [host] for url.
    @return {String} fully formed url.
    */
    function url(path, host) {
      if (!host) {
        var addr = server.address();
        host = 'http://' + addr.address + ':' + addr.port;
      }
      return host + path;
    }

    function endpoint(method, host, handler) {
      if (typeof host === 'function') {
        handler = host;
        host = null;
      }

      var path = '/' + uuid.v4();
      app[method](path, handler);
      return url(path, host);
    }

    app.once('error', reject);
    server = app.listen(0, function() {
      server.endpoint = endpoint;
      accept(server);
    });
  });
}

module.exports = getServer;
