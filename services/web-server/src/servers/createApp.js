const bodyParser = require('body-parser');
const bodyParserGraphql = require('body-parser-graphql');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const playground = require('graphql-playground-middleware-express').default;
const passport = require('passport');
const url = require('url');
const credentials = require('./credentials');
const oauth2AccessToken = require('./oauth2AccessToken');
const oauth2 = require('./oauth2');

module.exports = async ({ cfg, strategies, AuthorizationCode, AccessToken, auth, monitor }) => {
  const app = express();

  app.set('trust proxy', cfg.server.trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', 'src/views');

  const allowedCORSOrigins = cfg.server.allowedCORSOrigins.map(o => {
    if (typeof(o) === 'string' && o.startsWith('/')) {
      return new RegExp(o.slice(1, o.length - 1));
    }
    if (o === 'https://taskcluster.net') {
      o = 'https://taskcluster-ui.herokuapp.com';
    }
    return o;
  }).filter(o => o && o !== "");
  app.use(cors({
    origin: allowedCORSOrigins,
    credentials: true,
  }));
  const thirdPartyLoginCors = cors({
    origin: cfg.login.registeredClients
      ? [...new Set([].concat(...cfg.login.registeredClients.map(({ redirectUri }) => new URL(redirectUri).origin)))]
      : false,
    credentials: true,
  });

  app.use(session({
    store: new MemoryStore({
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
  app.post(
    '/graphql',
    credentials(),
    bodyParserGraphql.graphql({
      limit: '1mb',
    })
  );

  if (cfg.app.playground) {
    app.get(
      '/playground',
      playground({
        endpoint: '/graphql',
        subscriptionsEndpoint: '/subscription',
      })
    );
  }

  passport.serializeUser((user, done) => {
    const { identityProviderId, identity } = user;

    return done(null, {
      identityProviderId,
      identity,
    });
  });
  passport.deserializeUser(async (obj, done) => {
    return done(null, obj);
  });

  app.post('/login/logout', (req, res) => {
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
  } = oauth2(cfg, AuthorizationCode, AccessToken, strategies, auth, monitor);

  // 1. Render a dialog asking the user to grant access
  app.get('/login/oauth/authorize', authorization);
  // 2. Process the dialog submission (skipped if redirectUri is whitelisted)
  app.post('/login/oauth/authorize/decision', decision);
  // 3. Exchange code for an OAuth2 token
  app.post('/login/oauth/token', thirdPartyLoginCors, token);
  // 4. Get Taskcluster credentials
  app.get('/login/oauth/credentials', thirdPartyLoginCors, oauth2AccessToken(), getCredentials);

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
