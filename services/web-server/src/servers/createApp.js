import * as bodyParser from 'body-parser-graphql';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import playground from 'graphql-playground-middleware-express';
import passport from 'passport';
import credentials from './credentials';
import graphql from './graphql';

export default async ({ cfg, schema, context }) => {
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
    }),
    graphql({
      schema,
      context,
      tracing: true,
    })
  );
  app.get(
    '/playground',
    playground({
      endpoint: '/graphql',
      subscriptionsEndpoint: '/subscription',
    })
  );

  await Promise.all(
    cfg.app.loginStrategies.map(async strategy => {
      const { default: loginStrategy } = await import(`../login/${strategy}`);

      loginStrategy(app, cfg);
    })
  );

  return app;
};
