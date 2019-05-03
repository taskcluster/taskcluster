const debug = require('debug')('purge-cache');
const config = require('taskcluster-lib-config');
const loader = require('taskcluster-lib-loader');
const monitorManager = require('./monitor');
const SchemaSet = require('taskcluster-lib-validate');
const {sasCredentials} = require('taskcluster-lib-azure');
const App = require('taskcluster-lib-app');
const libDocs = require('taskcluster-lib-docs');
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
      monitor: monitor.monitor('table.purgecaches'),
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
    setup: ({cfg, CachePurge, monitor}) => {
      return monitor.monitor().oneShot('expire-purge-caches', async () => {
        const now = taskcluster.fromNow(cfg.app.cachePurgeExpirationDelay);
        debug('Expiring cache-purges at: %s, from before %s', new Date(), now);
        const count = await CachePurge.expire(now);
        debug('Expired %s cache-purges', count);
      });
    },
  },

  api: {
    requires: ['cfg', 'monitor', 'schemaset', 'CachePurge'],
    setup: ({cfg, monitor, schemaset, CachePurge}) => builder.build({
      context: {cfg, CachePurge, cachePurgeCache: {}},
      rootUrl: cfg.taskcluster.rootUrl,
      schemaset,
      monitor: monitor.monitor('api'),
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libDocs({
      projectName: 'taskcluster-purge-cache',
      schemaset,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        }, {
          name: 'logs',
          reference: monitorManager.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => App({
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
