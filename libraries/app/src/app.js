"use strict";

var express         = require('express');
var _               = require('lodash');
var debug           = require('debug')("base:app");
var assert          = require('assert');
var morgan          = require('morgan');
var Promise         = require('promise');
var http            = require('http');
var sslify          = require('express-sslify');

/** Notify LocalApp if running under this */
var notifyLocalAppInParentProcess = function(port) {
  // If there is a parent process post a message to notify it that the app is
  // ready and running on specified port. This is useful for automated
  // testing and hopefully won't cause pain anywhere else.
  if(process.send) {
    process.send({
      ready:  true,
      port:   port,
      appId:  process.env.LOCAL_APP_IDENTIFIER
    });
  }
};

/** Create server from app */
var createServer = function() {
  var app = this;
  return new Promise(function(accept, reject) {
    // Launch HTTP server
    var server = http.createServer(app);

    // Add a little method to help kill the server
    server.terminate = function() {
      return new Promise(function(accept, reject) {
        server.close(function() {
          accept();
        });
      });
    };

    // Handle errors
    server.once('error', reject);

    // Listen
    server.listen(app.get('port'), function() {
      debug('Server listening on port ' + app.get('port'));
      accept(server);
    });
  }).then(function(server) {
    notifyLocalAppInParentProcess(app.get('port'));
    return server;
  });
};

/** Create express application
 * options:
 * {
 *   port:          8080,           // Port to run the server on
 *   env:           'development',  // 'development' or 'production'
 *   forceSSL:      false,          // Force redirect to SSL or return 403
 *   trustProxy:    false           // Trust the proxy that forwarded for SSL
 * }
 *
 * Returns an express application with extra methods:
 *   - `setup`          (Configures middleware for HTML UI and persona login)
 *   - `createServer`   (Creates an server)
 */
var app = function(options) {
  assert(options,                           "options are required");
  assert(typeof(options.port) === 'number', "Port must be a number");
  assert(options.env == 'development' ||
         options.env == 'production',       "env must be prod... or dev...");
  assert(options.forceSSL !== undefined,    "forceSSL must be defined");
  assert(options.trustProxy !== undefined,  "trustProxy must be defined");

  // Create application
  var app = express();
  app.set('port', options.port);
  app.set('env', options.env);
  app.set('json spaces', 2);

  // ForceSSL if required suggested
  if (options.forceSSL) {
    app.use(sslify.HTTPS(options.trustProxy));
  }

  // Middleware for development
  if (app.get('env') == 'development') {
    app.use(morgan('dev'));
  }

  // Add some auxiliary methods to the app
  app.createServer = createServer;

  return app;
};

// Export app creation utility
module.exports = app;

// Export notifyLocalAppInParentProcess for non-app processes to use
app.notifyLocalAppInParentProcess = notifyLocalAppInParentProcess;