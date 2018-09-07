import * as bodyParser from 'body-parser-graphql';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import playground from 'graphql-playground-middleware-express';
import passport from 'passport';
import credentials from './credentials';
import graphql from './graphql';

export default ({ cfg, schema, context }) => {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', 'src/views');
  app.use(cors());
  app.use(passport.initialize());
  app.use(credentials());
  app.use(compression());
  app.post(
    '/graphql',
    bodyParser.graphql(),
    graphql({
      schema,
      context,
    })
  );
  app.get(
    '/playground',
    playground({
      endpoint: '/graphql',
      subscriptionsEndpoint: '/subscription',
    })
  );

  cfg.app.loginStrategies.forEach(async strategy => {
    const { default: loginStrategy } = await import(`../login/${strategy}`);

    loginStrategy(app, cfg);
  });

  return app;
};
