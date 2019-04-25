import * as bodyParser from 'body-parser-graphql';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import playground from 'graphql-playground-middleware-express';
import passport from 'passport';
import credentials from './credentials';

export default async ({ cfg, strategies }) => {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', 'src/views');
  app.use(cors());
  app.use(passport.initialize());
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

  Object.values(strategies).forEach(strategy => {
    strategy.useStrategy(app, cfg);
  });

  return app;
};
