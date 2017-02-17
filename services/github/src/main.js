let debug = require('debug')('taskcluster-github:loader');
let api = require('./api');
let path = require('path');
let exchanges = require('./exchanges');
let Handlers = require('./handlers');
let Intree = require('./intree');
let data = require('./data');
let _ = require('lodash');
let taskcluster = require('taskcluster-client');
let config = require('typed-env-config');
let monitor = require('taskcluster-lib-monitor');
let validator = require('taskcluster-lib-validate');
let loader = require('taskcluster-lib-loader');
let docs = require('taskcluster-lib-docs');
let App = require('taskcluster-lib-app');
let githubAuth = require('./github-auth');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: cfg.app.name,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validator({
      prefix: 'github/v1/',
      aws: cfg.aws,
    }),
  },

  docs: {
    requires: ['cfg', 'validator', 'reference'],
    setup: ({cfg, validator, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'integrations',
      schemas: validator.schemas,
      project: 'github',
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

  publisher: {
    requires: ['cfg', 'monitor', 'validator'],
    setup: async ({cfg, monitor, validator}) => exchanges.setup({
      credentials:        cfg.pulse,
      exchangePrefix:     cfg.app.exchangePrefix,
      validator:          validator,
      referencePrefix:    'github/v1/exchanges.json',
      publish:            process.env.NODE_ENV === 'production',
      aws:                cfg.aws,
      monitor:            monitor.prefix('publisher'),
    }),
  },

  github: {
    requires: ['cfg'],
    setup: ({cfg}) => githubAuth({cfg}),
  },

  intree: {
    requires: ['cfg'],
    setup: ({cfg}) => Intree.setup(cfg),
  },

  Builds: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      var build = await data.Build.setup({
        account: cfg.azure.account,
        table: cfg.app.buildTableName,
        credentials: cfg.taskcluster.credentials,
        monitor: monitor.prefix(cfg.app.buildTableName.toLowerCase()),
      });

      await build.ensureTable();
      return build;
    },
  },

  OwnersDirectory: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      var ownersDir = await data.OwnersDirectory.setup({
        account: cfg.azure.account,
        table: cfg.app.ownersDirectoryTableName,
        credentials: cfg.taskcluster.credentials,
        monitor: monitor.prefix(cfg.app.ownersDirectoryTableName.toLowerCase()),
      });

      await ownersDir.ensureTable();
      return ownersDir;
    },
  },

  api: {
    requires: ['cfg', 'monitor', 'validator', 'github', 'publisher', 'Builds', 'OwnersDirectory'],
    setup: ({cfg, monitor, validator, github, publisher, Builds, OwnersDirectory}) => api.setup({
      context:          {publisher, cfg, github, Builds, OwnersDirectory, monitor: monitor.prefix('api-context')},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          process.env.NODE_ENV === 'production',
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'github/v1/api.json',
      aws:              cfg.aws,
      monitor:          monitor.prefix('api'),
      validator,
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => {

      debug('Launching server.');
      let app = App(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      exchangePrefix:   cfg.app.exchangePrefix,
      credentials:      cfg.pulse,
    }),
  },

  handlers: {
    requires: ['cfg', 'github', 'monitor', 'intree', 'validator', 'reference', 'Builds'],
    setup: async ({cfg, github, monitor, intree, validator, reference, Builds}) => new Handlers({
      credentials: cfg.pulse,
      monitor: monitor.prefix('handlers'),
      intree,
      reference,
      jobQueueName: cfg.app.jobQueueName,
      statusQueueName: cfg.app.statusQueueName,
      context: {cfg, github, validator, Builds},
    }),
  },

  worker: {
    requires: ['handlers'],
    setup: async ({handlers}) => handlers.setup(),
  },
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack || err);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
