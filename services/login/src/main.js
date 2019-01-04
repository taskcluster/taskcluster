const config = require('taskcluster-lib-config');
const loader = require('taskcluster-lib-loader');
const scanner = require('./scanner');
const App = require('taskcluster-lib-app');
const SchemaSet = require('taskcluster-lib-validate');
const monitor = require('taskcluster-lib-monitor');
const docs = require('taskcluster-lib-docs');
const builder = require('./v1');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
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
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-login',
      enable: cfg.monitoring.enable,
      credentials: cfg.app.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'login',
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.app.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      tier: 'integrations',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'handlers'],
    setup: ({cfg, schemaset, monitor, handlers}) => builder.build({
      schemaset,
      context: {cfg, handlers},
      rootUrl: cfg.taskcluster.rootUrl,
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  scanner: {
    requires: ['cfg', 'handlers', 'monitor'],
    setup: ({cfg, handlers, monitor}) => {
      return monitor.oneShot('scanner', () => scanner(cfg, handlers));
    },
  },

  // utility function to show Auth0 profile
  'show-auth0-profile': {
    requires: ['cfg', 'handlers'],
    setup: async ({cfg, handlers}) => {
      let userId = process.argv[3];
      if (!userId) {
        console.error('Specify an userId address on the command line');
        process.exit(1);
        return;
      }

      const handler = handlers['mozilla-auth0'];

      console.log(await handler.profileFromUserId(userId));
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
