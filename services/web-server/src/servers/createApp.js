import bodyParser from 'body-parser';
import path from 'path';
import bodyParserGraphql from 'body-parser-graphql';
import session from 'express-session';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import graphqlPlayground from 'graphql-playground-middleware-express';
const playground = graphqlPlayground.default;
import passport from 'passport';
import MemoryStoreFactory from 'memorystore';
const MemoryStore = MemoryStoreFactory(session);
import credentials from './credentials.js';
import oauth2AccessToken from './oauth2AccessToken.js';
import oauth2 from './oauth2.js';
import PostgresSessionStore from '../login/PostgresSessionStore.js';
import { traceMiddleware } from '@taskcluster/lib-app';

const __dirname = new URL('.', import.meta.url).pathname;

export default async ({ cfg, strategies, auth, monitor, db, clients, rootUrl, api }) => {
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
      secure: URL.parse(cfg.app.publicUrl)?.hostname !== 'localhost',
      httpOnly: true,
      // 1 week
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.disable('x-powered-by');
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(compression());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json({ limit: '10mb' }));
  app.options('/graphql', cors(corsOptions));
  app.post(
    '/graphql',
    cors(corsOptions),
    credentials(),
    bodyParserGraphql.graphql({
      limit: '10mb',
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

  app.post('/login/logout', cors(corsOptions), async (req, res) => {
    // Remove the req.user property and clear the login session
    await new Promise((resolve, reject) => {
      try {
        req.logout(resolve);
      } catch (err) {
        reject(err);
      }
    });

    res
      .status(200)
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

  // 1. Render a dialog asking the user to grant access
  app.get('/login/oauth/authorize', cors(corsOptions), authorization);
  // 2. Process the dialog submission (skipped if redirectUri is whitelisted)
  app.post('/login/oauth/authorize/decision', cors(corsOptions), decision);
  // 3. Exchange code for an OAuth2 token
  app.options('/login/oauth/token', cors(thirdPartyCorsOptions));
  app.post('/login/oauth/token', cors(thirdPartyCorsOptions), token);
  // 4. Get Taskcluster credentials
  app.options('/login/oauth/credentials', cors(thirdPartyCorsOptions));
  app.get('/login/oauth/credentials', cors(thirdPartyCorsOptions), oauth2AccessToken(), getCredentials);

  // Mount lib-api routes (profiler endpoints, Dockerflow health checks)
  if (api) {
    api.express(app);
  }

  // Error handling middleware
  app.use((err, req, res, next) => {
    // Minimize the amount of information we disclose. The err could potentially disclose something to an attacker.
    const error = { code: err.code, name: err.name };
    monitor.reportError(err);
    let statusCode = 500;

    if (err.name === 'InputError') {
      Object.assign(error, { message: err.message });
    }
    if (err.name === 'PayloadTooLargeError') {
      Object.assign(error, { code: 413, message: 'Payload too large' });
      statusCode = 413;
    }

    res.status(statusCode).json(error);
  });

  return app;
};
