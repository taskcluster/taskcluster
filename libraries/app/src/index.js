const express = require('express');
const _ = require('lodash');
const debug = require('debug')('base:app');
const assert = require('assert');
const http = require('http');
const sslify = require('express-sslify');
const hsts = require('hsts');
const csp = require('content-security-policy');
const uuidv4 = require('uuid/v4');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '../../../');

/**
 * Attach trace headers to requests. This is exported
 * to be used in web-server as well sice it doesn't use
 * lib-app.
 */
const traceMiddleware = (req, res, next) => {
  let traceId;
  if (req.headers['x-taskcluster-trace-id']) {
    traceId = req.headers['x-taskcluster-trace-id'];
  } else {
    traceId = uuidv4();
  }
  req.traceId = traceId;
  req.requestId = uuidv4();
  res.setHeader('x-for-trace-id', traceId);
  res.setHeader('x-for-request-id', req.requestId);
  next();
};

/**
 * Create server; this becomes a method of the `app` object, so `this`
 * refers to an Express app.
 */
const createServer = function() {
  // 404 Error handler
  this.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({error: 'Not found'});
  });

  return new Promise((accept, reject) => {
    // Launch HTTP server
    const server = http.createServer(this);

    // Add a little method to help kill the server
    server.terminate = () => {
      return new Promise((accept, reject) => {
        server.close(accept);
      });
    };

    // Handle errors
    server.once('error', reject);

    // Listen
    server.listen(this.get('port'), () => {
      debug('Server listening on port ' + this.get('port'));
      accept(server);
    });
  });
};

/** Create express application.  See the README for docs.
 */
const app = async (options) => {
  assert(options, 'options are required');
  _.defaults(options, {
    contentSecurityPolicy: true,
    robotsTxt: true,
  });
  assert(typeof options.port === 'number', 'Port must be a number');
  assert(options.env === 'development' ||
         options.env === 'production', 'env must be production or development');
  assert(options.forceSSL !== undefined, 'forceSSL must be defined');
  assert(options.trustProxy !== undefined, 'trustProxy must be defined');
  assert(options.apis, 'Must provide an array of apis');
  assert(!options.rootDocsLink, '`rootDocsLink` is no longer allowed');
  assert(!options.docs, '`docs` is no longer allowed');

  // Create application
  const app = express();
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
      force: true,
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

  if (options.trustProxy) {
    app.set('trust proxy', true);
  }

  // keep cheap security vuln scanners happy..
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    next();
  });

  // attach trace-id and request-id to request object and response
  app.use(traceMiddleware);

  if (options.robotsTxt) {
    app.use('/robots.txt', (req, res) => {
      res.header('Content-Type', 'text/plain');
      res.send('User-Agent: *\nDisallow: /\n');
    });
  }

  app.use('/__version__', (req, res) => {
    const taskclusterVersionFile = path.resolve(REPO_ROOT, 'version.json');

    try {
      const taskclusterVersion = fs.readFileSync(taskclusterVersionFile).toString().trim();
      res.header('Content-Type', 'application/json');
      res.send(taskclusterVersion);
    } catch (err) {
      res.header('Content-Type', 'application/json');
      res.status(500).send({ error: 'Not found' });
    }
  });

  app.use('/__heartbeat__', (req, res) => {
    res.header('Content-Type', 'application/json');
    res.status(200).send({});
  });

  app.use('/__lbheartbeat__', (req, res) => {
    res.header('Content-Type', 'application/json');
    res.status(200).send({});
  });

  options.apis.forEach(api => {
    api.express(app);
  });

  // Add some auxiliary methods to the app
  app.createServer = createServer;

  return app.createServer();
};

// Export app creation utility
module.exports = {App: app, traceMiddleware};
