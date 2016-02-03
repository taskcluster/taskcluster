import express from 'express'
import passport from 'passport'
import _ from 'lodash'
import sslify from 'express-sslify'
import http from 'http'
import path from 'path'
import session from 'cookie-session'
import config from 'taskcluster-lib-config'
import bodyParser from 'body-parser'
import User from './user'
import querystring from 'querystring'
import loader from 'taskcluster-lib-loader'

require('source-map-support').install();

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => {
      return config({profile})
    },
  },

  authorizers: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let authorizers = cfg.app.authorizers.map((name) => {
        let Authz = require('./authz/' + name);
        return new Authz({cfg});
      });
      await Promise.all(authorizers.map(authz => authz.setup()));
      return authorizers;
    },
  },

  authenticators: {
    requires: ['cfg', 'authorizers'],
    setup: ({cfg, authorizers}) => {
      let authenticators = {};
      let authorize = (user, done) => {
        Promise.all(authorizers.map(authz => authz.authorize(user)))
        .then(() => done(null, user), (err) => done(err, null));
      }
      cfg.app.authenticators.forEach((name) => {
        let Authn = require('./authn/' + name);
        authenticators[name] = new Authn({cfg, authorize});
      });
      return authenticators;
    },
  },

  app: {
    requires: ['cfg', 'authenticators'],
    setup: ({cfg, authenticators}) => {
      // Create application
      let app = express();

      // Trust proxy
      app.set('trust proxy', cfg.server.trustProxy);

      // ForceSSL if required suggested
      if (cfg.server.forceSSL) {
        app.use(sslify.HTTPS(cfg.server.trustProxy));
      }

      // Setup views and assets
      app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
      app.set('views', path.join(__dirname, '..', 'views'));
      app.set('view engine', 'jade');

      // Parse request bodies (required for passport-persona)
      app.use(bodyParser.urlencoded({extended: false}));

      // Store session in a signed cookie
      app.use(session({
        name: 'taskcluster-login',
        keys: cfg.app.cookieSecrets,
        secure: cfg.server.forceSSL,
        secureProxy: cfg.server.trustProxy,
        httpOnly: true,
        signed: true,
        maxAge: 3 * 24 * 60 * 60 * 1000
      }));

      // Initially passport
      app.use(passport.initialize());
      app.use(passport.session());

      // Read and write user from signed cookie
      passport.serializeUser((user, done) => done(null, user.serialize()));
      passport.deserializeUser((data, done) => done(null, User.deserialize(data)));

      // set up authenticators' sub-paths
      _.forIn(authenticators, (authn, name) => {
        app.use('/' + name, authn.router());
      });

      // Add logout method
      app.post('/logout', (req, res) => {
        req.logout();
        res.redirect('/');
      });

      // Render index
      app.get('/', (req, res) => {
        let user = User.get(req);
        let credentials = user.createCredentials(cfg.app.temporaryCredentials);
        res.render('index', {
          user, credentials,
          querystring,
          allowedHosts: cfg.app.allowedRedirectHosts,
          query: req.query,
        });
      });

      return app;
    },
  },

  server: {
    requires: ['cfg', 'app'],
    setup: async ({cfg, app}) => {
      // Create server and start listening
      let server = http.createServer(app);
      await new Promise((accept, reject) => {
        server.listen(cfg.server.port, accept);
        server.once('error', reject);
      });
      console.log("Listening on port: " + cfg.server.port);
    },
  },
}, ['profile']);

if (!module.parent) {
  load('server', {
    profile: process.argv[2]
  }).catch(err => {
    console.log("Server crashed: " + err.stack);
  }).catch(() => process.exit(1));
}

module.exports = load;
