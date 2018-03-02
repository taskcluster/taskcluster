const config = require('taskcluster-lib-config');
const loader = require('taskcluster-lib-loader');
const scanner = require('./scanner');
const v1 = require('./v1');
const App = require('taskcluster-lib-app');
const validator = require('taskcluster-lib-validate');
const monitor = require('taskcluster-lib-monitor');
const docs = require('taskcluster-lib-docs');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => {
      return config({profile});
    },
  },

  handlers: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      let handlers = {};

      Object.keys(cfg.handlers).forEach((name) => {
        let Handler = require('./handlers/' + name);
        handlers[name] = new Handler({name, cfg});
      });
      return handlers;
    },
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: 'taskcluster-login',
      credentials: cfg.app.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return validator({
        prefix: 'login/v1/',
        publish: cfg.app.publishMetaData,
        aws: cfg.aws,
      });
    },
  },

  router: {
    requires: ['cfg', 'validator', 'monitor', 'handlers'],
    setup: ({cfg, validator, monitor, handlers}) => {
      return v1.setup({
        context: {},
        validator,
        authBaseUrl:      cfg.authBaseUrl,
        publish:          cfg.app.publishMetaData,
        baseUrl:          cfg.server.publicUrl + '/v1',
        referencePrefix:  'login/v1/api.json',
        aws:              cfg.aws,
        monitor:          monitor.prefix('api'),
        context:          {cfg, handlers},
      });
    },
  },

  docs: {
    requires: ['cfg', 'validator'],
    setup: ({cfg, validator}) => docs.documenter({
      credentials: cfg.app.credentials,
      tier: 'integrations',
      schemas: validator.schemas,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: v1.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        },
      ],
    }),
  },

  app: {
    requires: ['cfg', 'docs', 'router'],
    setup: ({cfg, docs, router}) => {
      // Create application
      let app = App({
        port: cfg.server.port,
        publicUrl: cfg.server.publicUrl,
        env: cfg.server.env,
        forceSSL: cfg.server.forceSSL,
        trustProxy: cfg.server.trustProxy,
        rootDocsLink: true, // doesn't work?
        docs,
      });
      app.use('/v1', router);
      return app;
    },
  },

  server: {
    requires: ['cfg', 'app'],
    setup: async ({cfg, app}) => {
      // Create server and start listening
      return app.createServer();
    },
  },

  scanner: {
    requires: ['cfg', 'handlers'],
    setup: async ({cfg, handlers}) => {
      await scanner(cfg, handlers);
      // the LDAP connection is still open, so we must exit
      // explicitly or node will wait forever for it to die.
      process.exit(0);
    },
  },
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    profile: process.env.NODE_ENV,
    process: process.argv[2],
  }).catch(err => {
    console.log('Server crashed: ' + err.stack);
    process.exit(1);
  });
}

module.exports = load;
