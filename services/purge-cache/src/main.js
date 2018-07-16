const debug = require('debug')('purge-cache');
const assert = require('assert');
const path = require('path');
const _ = require('lodash');
const config = require('typed-env-config');
const loader = require('taskcluster-lib-loader');
const monitor = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');
const {sasCredentials} = require('taskcluster-lib-azure');
const App = require('taskcluster-lib-app');
const docs = require('taskcluster-lib-docs');
const taskcluster = require('taskcluster-client');
const builder = require('./api');
const exchanges = require('./exchanges');
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
      publish:  cfg.app.publishMetaData,
      aws:      cfg.aws,
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: cfg.monitoring.project,
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
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
    setup: async ({cfg, CachePurge, monitor}) => {
      let now = taskcluster.fromNow(cfg.app.cachePurgeExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire task-groups using delay
      debug('Expiring cache-purges at: %s, from before %s', new Date(), now);
      let count = await CachePurge.expire(now);
      debug('Expired %s cache-purges', count);

      monitor.count('expire-cache-purges.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'monitor'],
    setup: async ({cfg, schemaset, monitor}) => exchanges.setup({
      credentials: cfg.pulse,
      validator: await schemaset.validator(cfg.taskcluster.rootUrl),
      rootUrl: cfg.taskcluster.rootUrl,
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('publisher'),
    }),
  },

  api: {
    requires: ['cfg', 'monitor', 'schemaset', 'publisher', 'CachePurge'],
    setup: ({cfg, monitor, schemaset, publisher, CachePurge}) => builder.build({
      context: {cfg, publisher, CachePurge, cachePurgeCache: {}},
      rootUrl: cfg.taskcluster.rootUrl,
      schemaset,
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('api'),
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.pulse,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset', 'reference'],
    setup: ({cfg, schemaset, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        }, {
          name: 'events',
          reference: reference,
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
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
