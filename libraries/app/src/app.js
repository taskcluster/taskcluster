var express         = require('express');
var _               = require('lodash');
var debug           = require('debug')('base:app');
var assert          = require('assert');
var morganDebug     = require('morgan-debug');
var Promise         = require('promise');
var http            = require('http');
var sslify          = require('express-sslify');
var hsts            = require('hsts');
var csp             = require('content-security-policy');

/** Notify LocalApp if running under this */
var notifyLocalAppInParentProcess = function(port) {
  // If there is a parent process post a message to notify it that the app is
  // ready and running on specified port. This is useful for automated
  // testing and hopefully won't cause pain anywhere else.
  if (process.send) {
    process.send({
      ready:  true,
      port:   port,
      appId:  process.env.LOCAL_APP_IDENTIFIER,
    });
  }
};

/** Create server from app */
var createServer = function() {
  var that = this;
  return new Promise(function(accept, reject) {
    // Launch HTTP server
    var server = http.createServer(that);

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
    server.listen(that.get('port'), function() {
      debug('Server listening on port ' + that.get('port'));
      accept(server);
    });
  }).then(function(server) {
    notifyLocalAppInParentProcess(that.get('port'));
    return server;
  });
};

/** Create express application
 * options:
 * {
 *   port:                  8080,           // Port to run the server on
 *   env:                   'development',  // 'development' or 'production'
 *   forceSSL:              false,          // Force redirect to SSL or return 403
 *   trustProxy:            false,          // Trust the proxy that forwarded for SSL
 *   contentSecurityPolicy: true,           // Send CSP (default true!)
 * }
 *
 * Returns an express application with extra methods:
 *   - `createServer`   (Creates an server)
 */
var app = function(options) {
  assert(options,                           'options are required');
  assert(typeof options.port === 'number', 'Port must be a number');
  assert(options.env == 'development' ||
         options.env == 'production',       'env must be production or development');
  assert(options.forceSSL !== undefined,    'forceSSL must be defined');
  assert(options.trustProxy !== undefined,  'trustProxy must be defined');

  // Create application
  var app = express();
  app.set('port', options.port);
  app.set('env', options.env);
  app.set('json spaces', 2);

  // ForceSSL if required suggested
  if (options.forceSSL) {
    app.use(sslify.HTTPS({
      trustProtoHeader: options.trustProxy,
    }));
  }

  // When we force SSL, we also want to set the HSTS header file correctly.  We
  // also want to allow testing code to check for the HSTS header being
  // generated correctly without having to generate an SSL cert and key and
  // have express listen on ssl
  if (options.forceSSL || options.forceHSTS) {
    app.use(hsts({
      maxAge: 1000 * 60 * 60 * 24 * 90,
      force:true,
    }));
  }

  if (options.contentSecurityPolicy) {
    // if you're loading HTML from an API, you're doing it wrong..
    app.use(csp.getCSP({
      'default-src': csp.SRC_NONE,
      'frame-ancestors': csp.SRC_NONE,
      'base-uri': csp.SRC_NONE,
      'report-uri': '/__cspreport__',
    }));
  }

  // keep cheap security vuln scanners happy..
  app.disable('x-powered-by');

  // Middleware for development
  if (app.get('env') == 'development') {
    app.use(morganDebug('base:app:request', 'dev'));
  }

  // Add some auxiliary methods to the app
  app.createServer = createServer;

  return app;
};

// Export app creation utility
module.exports = app;

// Export notifyLocalAppInParentProcess for non-app processes to use
app.notifyLocalAppInParentProcess = notifyLocalAppInParentProcess;
