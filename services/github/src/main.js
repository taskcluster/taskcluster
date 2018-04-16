let debug = require('debug')('taskcluster-github:loader');
let api = require('./api');
let path = require('path');
let exchanges = require('./exchanges');
let Handlers = require('./handlers');
let Intree = require('./intree');
let data = require('./data');
let _ = require('lodash');
let Promise = require('bluebird');
let Ajv = require('ajv');
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
      project: cfg.monitoring.project || 'taskcluster-github',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validator({
      prefix: 'github/v1/',
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  ajv: {
    requires: [],
    setup: () => new Ajv(),
  },

  docs: {
    requires: ['cfg', 'validator', 'reference'],
    setup: ({cfg, validator, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'integrations',
      schemas: validator.schemas,
      publish: cfg.app.publishMetaData,
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

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  publisher: {
    requires: ['cfg', 'monitor', 'validator'],
    setup: async ({cfg, monitor, validator}) => exchanges.setup({
      credentials:        cfg.pulse,
      exchangePrefix:     cfg.app.exchangePrefix,
      validator:          validator,
      referencePrefix:    'github/v1/exchanges.json',
      publish: cfg.app.publishMetaData,
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
        monitor: monitor.prefix('table.builds'),
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
        monitor: monitor.prefix('table.ownersdirectory'),
      });

      await ownersDir.ensureTable();
      return ownersDir;
    },
  },

  api: {
    requires: ['cfg', 'monitor', 'validator', 'github', 'publisher', 'Builds', 'OwnersDirectory', 'ajv'],
    setup: ({cfg, monitor, validator, github, publisher, Builds, OwnersDirectory, ajv}) => api.setup({
      context:          {publisher, cfg, github, Builds, OwnersDirectory, monitor: monitor.prefix('api-context'), ajv},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish: cfg.app.publishMetaData,
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

  syncInstallations: {
    requires: ['github', 'OwnersDirectory'],
    setup: async ({github, OwnersDirectory}) => {
      let gh = await github.getIntegrationGithub();
      let installations = (await gh.apps.getInstallations({})).data;
      await Promise.map(installations, inst => {
        return OwnersDirectory.create({
          installationId: inst.id,
          owner: inst.account.login,
        }, true);
      });
    },
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
