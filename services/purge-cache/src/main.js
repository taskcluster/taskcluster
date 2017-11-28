let debug             = require('debug')('purge-cache');
let assert            = require('assert');
let path              = require('path');
let _                 = require('lodash');
let config            = require('typed-env-config');
let loader            = require('taskcluster-lib-loader');
let monitor           = require('taskcluster-lib-monitor');
let validate          = require('taskcluster-lib-validate');
let server            = require('taskcluster-lib-app');
let docs              = require('taskcluster-lib-docs');
let taskcluster       = require('taskcluster-client');
let api               = require('./api');
let exchanges         = require('./exchanges');
let data              = require('./data');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validate({
      prefix:  'purge-cache/v1/',
      aws:      cfg.aws,
    }),
  },
  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: 'purge-cache',
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  CachePurge: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => data.CachePurge.setup({
      account: cfg.azure.account,
      table: cfg.app.cachePurgeTableName,
      credentials: cfg.taskcluster.credentials,
      monitor: monitor.prefix(cfg.app.cachePurgeTableName.toLowerCase()),
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
    requires: ['cfg', 'validator', 'monitor'],
    setup: ({cfg, validator, monitor}) =>
      exchanges.setup({
        credentials:        cfg.pulse,
        exchangePrefix:     cfg.app.exchangePrefix,
        validator:          validator,
        referencePrefix:    'purge-cache/v1/exchanges.json',
        publish:            process.env.NODE_ENV === 'production',
        aws:                cfg.aws,
        monitor:            monitor.prefix('publisher'),
      }),
  },

  api: {
    requires: ['cfg', 'monitor', 'validator', 'publisher', 'CachePurge'],
    setup: ({cfg, monitor, validator, publisher, CachePurge}) => api.setup({
      context:          {cfg, publisher, CachePurge, cachePurgeCache: {}},
      validator:        validator,
      publish:          process.env.NODE_ENV === 'production',
      baseUrl:          cfg.server.publicUrl + '/v1',
      aws:              cfg.aws,
      referencePrefix:  'purge-cache/v1/api.json',
      monitor:          monitor.prefix('api'),
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      exchangePrefix:   cfg.app.exchangePrefix,
      credentials:      cfg.pulse,
    }),
  },

  docs: {
    requires: ['cfg', 'validator', 'reference'],
    setup: ({cfg, validator, reference}) => docs.documenter({
      project: 'purge-cache',
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemas: validator.schemas,
      references: [
        {
          name: 'api',
          reference: api.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        }, {
          name: 'events',
          reference: reference,
        },
      ],
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => {

      debug('Launching server.');
      let app = server(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
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
