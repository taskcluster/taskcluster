const builder = require('../src/api');
const schema = require('./schema');
const loader = require('taskcluster-lib-loader');
const SchemaSet = require('taskcluster-lib-validate');
const monitorManager = require('./monitor');
const App = require('taskcluster-lib-app');
const libReferences = require('taskcluster-lib-references');
const config = require('taskcluster-lib-config');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
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
      serviceName: 'secrets',
    }),
  },

  db: {
    requires: ['cfg'],
    setup: ({cfg}) => schema.setup(cfg.postgres),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), monitorManager.reference()],
    }).generateReferences(),
  },

  api: {
    requires: ['cfg', 'db', 'schemaset', 'monitor'],
    setup: async ({cfg, db, schemaset, monitor}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {cfg, db},
      monitor: monitor.childMonitor('api'),
      schemaset,
    }),
  },

  // NOTE: this would be done from the deployment scripts instead
  upgradeDb: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      await schema.upgrade(cfg.postgres);
    },
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
      port: Number(process.env.PORT || cfg.server.port),
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  expire: {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({cfg, db, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        // TODO
        /*
        const delay = cfg.app.secretExpirationDelay;
        const now = taskcluster.fromNow(delay);

        debug('Expiring secrets');
        const count = await Secret.expire(now);
        debug('Expired ' + count + ' secrets');
        */
      });
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
