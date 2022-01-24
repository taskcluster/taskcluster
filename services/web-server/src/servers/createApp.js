const bodyParser = require('body-parser');
const path = require('path');
const bodyParserGraphql = require('body-parser-graphql');
const session = require('express-session');
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const playground = require('graphql-playground-middleware-express').default;
const passport = require('passport');
const url = require('url');
const MemoryStore = require('memorystore')(session);
const credentials = require('./credentials');
const oauth2AccessToken = require('./oauth2AccessToken');
const oauth2 = require('./oauth2');
const PostgresSessionStore = require('../login/PostgresSessionStore');
const { traceMiddleware } = require('taskcluster-lib-app');

const REPO_ROOT = path.join(__dirname, '../../../../');

const taskclusterVersionFile = path.resolve(REPO_ROOT, 'version.json');
const taskclusterVersion = require(taskclusterVersionFile);

module.exports = async ({ cfg, strategies, auth, monitor, db }) => {
  const app = express();

  app.set('trust proxy', cfg.server.trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(path.join(__dirname, '../views')));

  const allowedCORSOrigins = cfg.server.allowedCORSOrigins.map(o => {
    if (typeof(o) === 'string' && o.startsWith('/')) {
      return new RegExp(o.slice(1, o.length - 1));
    }

    return o;
  }).filter(o => o && o !== "");
  const corsOptions = {
    origin: allowedCORSOrigins,
    credentials: true,
  };
  const thirdPartyCorsOptions = {
    ...corsOptions,
    origin: cfg.login.registeredClients
      ? [...new Set([].concat(...cfg.login.registeredClients.map(({ redirectUri }) => new URL(redirectUri).origin)))]
      : false,
  };

  const SessionStore = PostgresSessionStore({
    session,
    db,
    options: {
      // should be same time as cookie maxAge
      sessionTimeout: '1 week',
    },
  });

  app.use(traceMiddleware);
  app.use(session({
    store: process.env.NODE_ENV === 'production' ?
      new SessionStore() :
      // Run MemoryStore in local development so that we don't rely on Azure to store sessions.
      // The login story is messy at the moment.
      new MemoryStore({
        // prune expired entries every 1h
        checkPeriod: 1000 * 60 * 60,
      }),
    secret: cfg.login.sessionSecret,
    sameSite: true,
    resave: false,
    saveUninitialized: false,
    unset: 'destroy',
    cookie: {
      secure: url.parse(cfg.app.publicUrl).hostname !== 'localhost',
      httpOnly: true,
      // 1 week
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(compression());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.options('/graphql', cors(corsOptions));
  app.post(
    '/graphql',
    cors(corsOptions),
    credentials(),
    bodyParserGraphql.graphql({
      limit: '1mb',
    }),
  );

  if (cfg.app.playground) {
    app.get(
      '/playground',
      cors(corsOptions),
      playground({
        endpoint: '/graphql',
        subscriptionsEndpoint: '/subscription',
      }),
    );
  }

  passport.serializeUser((user, done) => {
    const { identityProviderId, identity } = user;

    return done(null, {
      identityProviderId,
      identity,
    });
  });
  passport.deserializeUser((obj, done) => {
    return done(null, obj);
  });

  app.post('/login/logout', cors(corsOptions), (req, res) => {
    // Remove the req.user property and clear the login session
    req.logout();
    res
      .status('200')
      .send();
  });

  Object.values(strategies).forEach(strategy => {
    strategy.useStrategy(app, cfg);
  });

  const {
    authorization,
    decision,
    token,
    getCredentials,
  } = oauth2(cfg, db, strategies, auth, monitor);

  // set up auth rate limiter: maximum # requests per minute
  const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: cfg.app.authRateLimitMaxRequests,
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });

  // set number of proxies between the user and the server
  // to ensure rate limiter doesn't behave like a global one
  app.set('trust proxy', cfg.app.numberOfProxies);

  // 1. Render a dialog asking the user to grant access
  app.get('/login/oauth/authorize', authLimiter, cors(corsOptions), authorization);
  // 2. Process the dialog submission (skipped if redirectUri is whitelisted)
  app.post('/login/oauth/authorize/decision', cors(corsOptions), decision);
  // 3. Exchange code for an OAuth2 token
  app.options('/login/oauth/token', cors(thirdPartyCorsOptions));
  app.post('/login/oauth/token', cors(thirdPartyCorsOptions), token);
  // 4. Get Taskcluster credentials
  app.options('/login/oauth/credentials', cors(thirdPartyCorsOptions));
  app.get('/login/oauth/credentials', cors(thirdPartyCorsOptions), oauth2AccessToken(), getCredentials);

  // Dockerflow endpoints
  // https://github.com/mozilla-services/Dockerflow
  app.get('/api/web-server/v1/__lbheartbeat__', (_req, res) => {
    res.json({});
  });
  app.get('/api/web-server/v1/__version__', (_req, res) => {
    res.json(taskclusterVersion);
  });
  // TODO: add implementation
  app.get('/api/web-server/v1/__heartbeat__', (_req, res) => {
    res.json({});
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    // Minimize the amount of information we disclose. The err could potentially disclose something to an attacker.
    const error = { code: err.code, name: err.name };

    if (err.name === 'InputError') {
      Object.assign(error, { message: err.message });
    }

    res.status(500).json(error);
  });

  return app;
};
