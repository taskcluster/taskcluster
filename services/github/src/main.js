const debug = require('debug')('taskcluster-github:loader');
const builder = require('./api');
const path = require('path');
const exchanges = require('./exchanges');
const Handlers = require('./handlers');
const Intree = require('./intree');
const data = require('./data');
const _ = require('lodash');
const Promise = require('bluebird');
const Ajv = require('ajv');
const taskcluster = require('taskcluster-client');
const config = require('typed-env-config');
const monitor = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');
const loader = require('taskcluster-lib-loader');
const docs = require('taskcluster-lib-docs');
const App = require('taskcluster-lib-app');
const {sasCredentials} = require('taskcluster-lib-azure');
const githubAuth = require('./github-auth');

const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-github',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'github',
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      rootUrl:          cfg.taskcluster.rootUrl,
      credentials:      cfg.pulse,
    }),
  },

  ajv: {
    requires: [],
    setup: () => new Ajv(),
  },

  docs: {
    requires: ['cfg', 'schemaset', 'reference'],
    setup: ({cfg, schemaset, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'integrations',
      schemaset: schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {name: 'api', reference: builder.reference()},
        {name: 'events', reference: reference},
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  publisher: {
    requires: ['cfg', 'monitor', 'schemaset'],
    setup: async ({cfg, monitor, schemaset}) => exchanges.setup({
      rootUrl:            cfg.taskcluster.rootUrl,
      credentials:        cfg.pulse,
      validator:          await schemaset.validator(cfg.taskcluster.rootUrl),
      publish:            cfg.app.publishMetaData,
      aws:                cfg.aws,
      monitor:            monitor.prefix('publisher'),
    }),
  },

  github: {
    requires: ['cfg'],
    setup: ({cfg}) => githubAuth({cfg}),
  },

  intree: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => Intree.setup({cfg, schemaset}),
  },

  Builds: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => data.Builds.setup({
      tableName: cfg.app.buildsTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.buildsTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.prefix('table.builds'),
    }),
  },

  OwnersDirectory: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => data.OwnersDirectory.setup({
      tableName: cfg.app.ownersDirectoryTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.ownersDirectoryTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.prefix('table.ownersdirectory'),
    }),
  },

  api: {
    requires: [
      'cfg', 'monitor', 'schemaset', 'github', 'publisher', 'Builds',
      'OwnersDirectory', 'ajv'],
    setup: ({cfg, monitor, schemaset, github, publisher, Builds,
      OwnersDirectory, ajv}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        publisher,
        cfg,
        github,
        Builds,
        OwnersDirectory,
        ajv,
        monitor: monitor.prefix('api-context'),
      },
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('api'),
      schemaset,
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api, docs}) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
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
    requires: ['cfg', 'github', 'monitor', 'intree', 'schemaset', 'reference', 'Builds'],
    setup: async ({cfg, github, monitor, intree, schemaset, reference, Builds}) => new Handlers({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.pulse,
      monitor: monitor.prefix('handlers'),
      intree,
      reference,
      jobQueueName: cfg.app.jobQueueName,
      statusQueueName: cfg.app.statusQueueName,
      context: {cfg, github, schemaset, Builds},
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
