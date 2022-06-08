require('../../prelude');
const builder = require('./api');
const exchanges = require('./exchanges');
const Handlers = require('./handlers');
const Intree = require('./intree');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const loader = require('taskcluster-lib-loader');
const { MonitorManager } = require('taskcluster-lib-monitor');
const libReferences = require('taskcluster-lib-references');
const { App } = require('taskcluster-lib-app');
const tcdb = require('taskcluster-db');
const githubAuth = require('./github-auth');
const { Client, pulseCredentials } = require('taskcluster-lib-pulse');

require('./monitor');

const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => config({
      profile,
      serviceName: 'github',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({ process, profile, cfg }) => MonitorManager.setup({
      serviceName: 'github',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({ cfg }) => new SchemaSet({
      serviceName: 'github',
    }),
  },

  reference: {
    requires: [],
    setup: () => exchanges.reference(),
  },

  ajv: {
    requires: [],
    setup: () => {
      const ajv = new Ajv();
      addFormats(ajv);
      return ajv;
    },
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('github')],
    }).generateReferences(),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => {
      return new Client({
        namespace: 'taskcluster-github',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'pulseClient'],
    setup: async ({ cfg, pulseClient, schemaset }) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      schemaset,
      client: pulseClient,
    }),
  },

  github: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => githubAuth({ cfg, monitor: monitor.childMonitor('octokit') }),
  },

  intree: {
    requires: ['cfg', 'schemaset'],
    setup: ({ cfg, schemaset }) => Intree.setup({ cfg, schemaset }),
  },

  db: {
    requires: ["cfg", "process", "monitor"],
    setup: ({ cfg, process, monitor }) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'github',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  api: {
    requires: [
      'cfg', 'monitor', 'schemaset', 'github', 'publisher', 'db', 'ajv'],
    setup: ({ cfg, monitor, schemaset, github, publisher, db, ajv }) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        publisher,
        cfg,
        github,
        db,
        ajv,
        monitor: monitor.childMonitor('api-context'),
      },
      monitor: monitor.childMonitor('api'),
      schemaset,
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({ cfg, api }) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  syncInstallations: {
    requires: ['github', 'db', 'monitor'],
    setup: ({ github, db, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const gh = await github.getAppGithub();
        const installations = (await gh.apps.listInstallations({})).data;
        await Promise.all(installations.map(i => {
          return db.fns.upsert_github_integration(
            i.account.login,
            i.id,
          );
        }));
      });
    },
  },

  handlers: {
    requires: [
      'cfg',
      'github',
      'monitor',
      'intree',
      'schemaset',
      'reference',
      'pulseClient',
      'publisher',
      'db',
    ],
    setup: async ({
      cfg,
      github,
      monitor,
      intree,
      schemaset,
      reference,
      pulseClient,
      publisher,
      db,
    }) =>
      new Handlers({
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.pulse,
        monitor: monitor.childMonitor('handlers'),
        intree,
        reference,
        jobQueueName: cfg.app.jobQueue,
        deprecatedResultStatusQueueName: cfg.app.deprecatedResultStatusQueue,
        deprecatedInitialStatusQueueName: cfg.app.deprecatedInitialStatusQueue,
        resultStatusQueueName: cfg.app.resultStatusQueue,
        initialStatusQueueName: cfg.app.initialStatusQueue,
        rerunQueueName: cfg.app.rerunQueue,
        context: { cfg, github, schemaset, db, publisher },
        pulseClient,
      }),
  },

  worker: {
    requires: ['handlers'],
    setup: async ({ handlers }) => handlers.setup(),
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
