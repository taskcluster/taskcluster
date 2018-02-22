import express from 'express';
import cors from 'cors';
import favicon from 'express-blank-favicon';
import playground from 'graphql-playground-middleware-express';
import jwt from './jwt';
import credentials from './credentials';
import gql from './gql';

let app;
const load = () => {
  const app = express();

  app.use(favicon);
  app.use(cors());
  app.use(
    jwt({
      jwksUri: process.env.JWKS_URI,
      issuer: process.env.JWT_ISSUER,
    })
  );
  app.use(
    credentials({
      url: 'https://login.taskcluster.net/v1/oidc-credentials/mozilla-auth0',
    })
  );
  app.use('/playground', playground({ endpointUrl: '/graphql' }));
  app.use(gql());

  return app;
};

if (module.hot) {
  module.hot.accept(['./jwt', './credentials', './gql'], () => {
    const next = load();

    app.removeListener('request', app);
    app.on('request', next);
    app = next;
  });
}

app = load();
app.listen(process.env.PORT || 3050);
