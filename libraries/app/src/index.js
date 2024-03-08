import express from 'express';
import _ from 'lodash';
import debugFactory from 'debug';
const debug = debugFactory('base:app');
import assert from 'assert';
import http from 'http';
import sslify from 'express-sslify';
import hsts from 'hsts';
import csp from 'content-security-policy';
import { v4 } from 'uuid';
import { loadVersion } from 'taskcluster-lib-api';

/**
 * Attach trace headers to requests. This is exported
 * to be used in web-server as well sice it doesn't use
 * lib-app.
 */
export const traceMiddleware = (req, res, next) => {
  let traceId;
  if (req.headers['x-taskcluster-trace-id']) {
    traceId = req.headers['x-taskcluster-trace-id'];
  } else {
    traceId = v4();
  }
  req.traceId = traceId;
  req.requestId = v4();
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
    res.status(404).json({ error: 'Not found' });
  });

  let server;
  let terminating;

  function shutdown() {
    if (terminating || !server) {
      debug('Already terminating or server not started');
      return terminating;
    }

    terminating = true;
    debug('Shutting down server');

    server.getConnections((err, count) => {
      if (err) {
        debug('Error getting connections', err);
        return;
      }
      debug('Connections open: ' + count);
    });
    server.terminate()
      .then(() => {
        debug('Server terminated');
        process.exit(0);
      });
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return new Promise((accept, reject) => {
    // Launch HTTP server
    server = http.createServer(this);

    // Add a little method to help kill the server
    server.terminate = () => {
      debug('Terminating server');
      // tell existing connections to close
      server.on('request', (req, res) => {
        if (!res.headersSent) {
          res.setHeader('Connection', 'close');
        }
        res.on('finish', () => req.socket.destroy());
      });

      return new Promise((accept, reject) => {
        server.close(accept);
      }).then(() => {
        debug('Server terminated on port ' + this.get('port'));
      });
    };

    // Handle errors
    server.once('error', reject);

    // Listen
    server.listen(this.get('port'), () => {
      debug('Server listening on port ' + this.get('port'));
      accept(server);
    });

    // let reverse proxies and load balancer enough time to read the response
    debug(`Setting keepAliveTimeout to ${this.get('keepAliveTimeout')} seconds`);
    server.keepAliveTimeout = this.get('keepAliveTimeout') * 1000;
  });
};

/** Create express application.  See the README for docs.
 */
export const App = async (options) => {
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
  assert(options.keepAliveTimeoutSeconds !== '' || typeof options.keepAliveTimeoutSeconds === 'number', 'keepAliveTimeout must be a number');
  assert(!options.rootDocsLink, '`rootDocsLink` is no longer allowed');
  assert(!options.docs, '`docs` is no longer allowed');

  // This mitigates the issue with reverse proxy and Load Balancer,
  // where connections are being closed before response is sent.
  // This timeout should be larger than downstream's timeout
  const DEFAULT_KEEP_ALIVE_TIMEOUT_SECONDS = 90;

  // Create application
  const app = express();
  app.set('port', options.port);
  app.set('env', options.env);
  app.set('json spaces', 2);
  app.set('keepAliveTimeout', options.keepAliveTimeoutSeconds || DEFAULT_KEEP_ALIVE_TIMEOUT_SECONDS);

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

  try {
    const taskclusterVersion = await loadVersion();
    app.use('/__version__', (req, res) => {
      res.header('Content-Type', 'application/json');
      res.send(taskclusterVersion);
    });
  } catch (err) {
    app.use('/__version__', (req, res) => {
      res.header('Content-Type', 'application/json');
      res.status(500).send({ error: 'Not found' });
    });
  }

  // TODO: heartbeat endpoint should verify all dependent taskcluster services
  // captured in https://github.com/taskcluster/taskcluster/issues/4597
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
