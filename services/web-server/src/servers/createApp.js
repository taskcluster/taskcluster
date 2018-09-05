import * as bodyParser from 'body-parser-graphql';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import playground from 'graphql-playground-middleware-express';
import passport from 'passport';
import credentials from './credentials';
import graphql from './graphql';

export default ({ schema, context }) => {
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

  if (process.env.LOGIN_STRATEGIES) {
    process.env.LOGIN_STRATEGIES.split(' ').forEach(async strategy => {
      const { default: loginStrategy } = await import(`../login/${strategy}`);

      loginStrategy(app);
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '\x1b[33m%s\x1b[0m',
      'Application started with no LOGIN_STRATEGIES defined.'
    );
  }

  return app;
};
