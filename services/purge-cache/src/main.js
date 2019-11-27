const debug = require('debug')('purge-cache');
const config = require('taskcluster-lib-config');
const loader = require('taskcluster-lib-loader');
const monitorManager = require('./monitor');
const SchemaSet = require('taskcluster-lib-validate');
const {sasCredentials} = require('taskcluster-lib-azure');
const App = require('taskcluster-lib-app');
const libReferences = require('taskcluster-lib-references');
const taskcluster = require('taskcluster-client');
const builder = require('./api');
const data = require('./data');

const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'purge-cache',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitorManager.setup({
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  CachePurge: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => data.CachePurge.setup({
      tableName: cfg.app.cachePurgeTableName,
      monitor: monitor.childMonitor('table.purgecaches'),
      credentials: sasCredentials({
        tableName: cfg.app.cachePurgeTableName,
        accountId: cfg.azure.accountId,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
    }),
  },

  'expire-cache-purges': {
    requires: ['cfg', 'CachePurge', 'monitor'],
    setup: ({cfg, CachePurge, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.cachePurgeExpirationDelay);
        debug('Expiring cache-purges at: %s, from before %s', new Date(), now);
        const count = await CachePurge.expire(now);
        debug('Expired %s cache-purges', count);
      });
    },
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), monitorManager.reference()],
    }).generateReferences(),
  },

  cachePurgeCache: {
    requires: [],
    // this begins as a simple empty object
    setup: () => ({}),
  },

  api: {
    requires: ['cfg', 'monitor', 'schemaset', 'CachePurge', 'cachePurgeCache'],
    setup: ({cfg, monitor, schemaset, CachePurge, cachePurgeCache}) => builder.build({
      context: {cfg, CachePurge, cachePurgeCache},
      rootUrl: cfg.taskcluster.rootUrl,
      schemaset,
      monitor: monitor.childMonitor('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
      ...cfg.server,
      apis: [api],
    }),
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
