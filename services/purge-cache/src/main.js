const debug = require('debug')('purge-cache');
const assert = require('assert');
const path = require('path');
const _ = require('lodash');
const config = require('typed-env-config');
const loader = require('taskcluster-lib-loader');
const Monitor = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');
const {sasCredentials} = require('taskcluster-lib-azure');
const App = require('taskcluster-lib-app');
const docs = require('taskcluster-lib-docs');
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
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => new Monitor({
      projectName: cfg.monitoring.project,
      level: config.app.level,
      enable: cfg.monitoring.enable,
      mock: profile === 'test',
      processName: process,
    }),
  },

  CachePurge: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => data.CachePurge.setup({
      tableName: cfg.app.cachePurgeTableName,
      monitor: monitor.prefix('table.purgecaches'),
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
      return monitor.oneShot('expire-purge-caches', async () => {
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
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('api'),
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-purge-cache',
      tier: 'core',
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
  load(process.argv[2]).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

module.exports = load;
