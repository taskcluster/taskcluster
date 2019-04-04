import * as bodyParser from 'body-parser-graphql';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import playground from 'graphql-playground-middleware-express';
import passport from 'passport';
import credentials from './credentials';

export default async ({ cfg }) => {
  const app = express();
  const sessionOpts = {
    secret: cfg.app.sessionSecretKey,
    cookie: {},
    resave: true,
    saveUninitialized: true,
  };

  if (process.env.NODE_ENV === 'production') {
    sessionOpts.cookie.secure = true;
  }

  app.set('view engine', 'ejs');
  app.set('views', 'src/views');
  app.use(cors());
  app.use(passport.initialize());
  app.use(session(sessionOpts));
  app.use(passport.session());
  app.use(credentials());
  app.use(compression());
  app.post(
    '/graphql',
    bodyParser.graphql({
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

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  cfg.app.loginStrategies.forEach(strategy => {
    const { default: loginStrategy } = require(`../login/${strategy}`);
    loginStrategy(app, cfg);
  });

  return app;
};
