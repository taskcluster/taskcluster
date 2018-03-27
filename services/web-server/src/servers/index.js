import * as bodyParser from 'body-parser-graphql';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import playground from 'graphql-playground-middleware-express';
import { createServer as httpServer } from 'http';
import { createServer as httpsServer } from 'https';
import credentials from './credentials';
import graphql from './graphql';
import jwt from './jwt';

export default ({ server, schema, context, https }) => {
  const app = express();

  app.use(cors());
  app.use(
    jwt({
      jwksUri: process.env.JWKS_URI,
      issuer: process.env.JWT_ISSUER,
    })
  );
  app.use(
    credentials({
      url: process.env.LOGIN_URL,
    })
  );
  app.use(compression());
  app.post(
    '/graphql',
    bodyParser.graphql(),
    graphql({
      schema,
      tracing: true,
      cacheControl: true,
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

  return {
    app,
    server: server || https ? httpsServer(https, app) : httpServer(app),
  };
};
