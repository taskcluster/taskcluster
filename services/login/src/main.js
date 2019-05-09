const config = require('taskcluster-lib-config');
const loader = require('taskcluster-lib-loader');
const scanner = require('./scanner');
const App = require('taskcluster-lib-app');
const SchemaSet = require('taskcluster-lib-validate');
const monitorManager = require('./monitor');
const libReferences = require('taskcluster-lib-references');
const builder = require('./api');

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
    setup: ({process, profile, cfg}) => monitorManager.setup({
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'login',
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), monitorManager.reference()],
    }).generateReferences(),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'handlers'],
    setup: ({cfg, schemaset, monitor, handlers}) => builder.build({
      schemaset,
      context: {cfg, handlers},
      rootUrl: cfg.taskcluster.rootUrl,
      monitor: monitor.childMonitor('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
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
}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (!module.parent) {
  load.crashOnError(process.argv[2]);
}

module.exports = load;
