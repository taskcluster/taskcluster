const Debug = require('debug');
const builder = require('../src/api');
const data = require('../src/data');
const loader = require('taskcluster-lib-loader');
const SchemaSet = require('taskcluster-lib-validate');
const monitorManager = require('./monitor');
const App = require('taskcluster-lib-app');
const libReferences = require('taskcluster-lib-references');
const taskcluster = require('taskcluster-client');
const config = require('taskcluster-lib-config');
const {sasCredentials} = require('taskcluster-lib-azure');

let debug = Debug('secrets:server');

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

  Secret: {
    requires: ['cfg', 'monitor', 'process'],
    setup: ({cfg, monitor, process}) => data.Secret.setup({
      tableName: cfg.app.secretsTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.secretsTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      cryptoKey: cfg.azure.cryptoKey,
      signingKey: cfg.azure.signingKey,
      monitor: monitor.childMonitor('table.secrets'),
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
    requires: ['cfg', 'Secret', 'schemaset', 'monitor'],
    setup: async ({cfg, Secret, schemaset, monitor}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {cfg, Secret},
      monitor: monitor.childMonitor('api'),
      schemaset,
    }),
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
    requires: ['cfg', 'Secret', 'monitor'],
    setup: ({cfg, Secret, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const delay = cfg.app.secretExpirationDelay;
        const now = taskcluster.fromNow(delay);

        debug('Expiring secrets');
        const count = await Secret.expire(now);
        debug('Expired ' + count + ' secrets');
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
