import '../../prelude.js';
import builder from './api.js';
import exchanges from './exchanges.js';
import Handlers from './handlers/index.js';
import Intree from './intree.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import taskcluster from 'taskcluster-client';
import config from 'taskcluster-lib-config';
import SchemaSet from 'taskcluster-lib-validate';
import loader from 'taskcluster-lib-loader';
import { MonitorManager } from 'taskcluster-lib-monitor';
import libReferences from 'taskcluster-lib-references';
import { App } from 'taskcluster-lib-app';
import tcdb from 'taskcluster-db';
import githubAuth from './github-auth.js';
import { Client, pulseCredentials } from 'taskcluster-lib-pulse';
import './monitor.js';
import { fileURLToPath } from 'url';

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
      const ajv = new Ajv.default();
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

  queueClient: {
    requires: ['cfg'],
    // This is a powerful Queue client without scopes to use throughout the handlers for things
    // where taskcluster-github is acting of its own accord
    // Where it is acting on behalf of a task, use this.queueClient.use({authorizedScopes: scopes}).blahblah
    // (see handlers.createTasks for example)
    setup: ({ cfg, monitor }) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  api: {
    requires: [
      'cfg', 'monitor', 'schemaset', 'github', 'publisher', 'db', 'ajv', 'queueClient', 'intree'],
    setup: ({ cfg, monitor, schemaset, github, publisher, db, ajv, queueClient, intree }) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        publisher,
        cfg,
        github,
        db,
        ajv,
        monitor: monitor.childMonitor('api-context'),
        queueClient,
        intree,
        schemaset,
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
      'queueClient',
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
      queueClient,
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
        rerunQueueName: cfg.app.rerunQueue,
        context: { cfg, github, schemaset, db, publisher },
        pulseClient,
        queueClient,
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  load.crashOnError(process.argv[2]);
}

export default load;
