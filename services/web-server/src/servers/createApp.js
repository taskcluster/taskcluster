const bodyParser = require('body-parser-graphql');
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const playground = require('graphql-playground-middleware-express').default;
const passport = require('passport');
const credentials = require('./credentials');

module.exports = async ({ cfg, strategies }) => {
  const app = express();

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
  }).filter(o => o);
  app.use(cors({origin: allowedCORSOrigins}));

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
