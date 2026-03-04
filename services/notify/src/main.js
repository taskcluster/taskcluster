import '../../prelude.js';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { Client, pulseCredentials } from '@taskcluster/lib-pulse';
import { App } from '@taskcluster/lib-app';
import loader from '@taskcluster/lib-loader';
import config from '@taskcluster/lib-config';
import SchemaSet from '@taskcluster/lib-validate';
import libReferences from '@taskcluster/lib-references';
import taskcluster from '@taskcluster/client';
import _ from 'lodash';
import { MonitorManager } from '@taskcluster/lib-monitor';
import builder from './api.js';
import Notifier from './notifier.js';
import RateLimit from './ratelimit.js';
import Denier from './denier.js';
import Handler from './handler.js';
import exchanges from './exchanges.js';
import matrix from 'matrix-js-sdk';
import MatrixBot from './matrix.js';
import slack from '@slack/web-api';
import SlackBot from './slack.js';
import tcdb from '@taskcluster/db';
import './monitor.js';
import { fileURLToPath } from 'url';

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => config({
      profile,
      serviceName: 'notify',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({ process, profile, cfg }) => MonitorManager.setup({
      serviceName: 'notify',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({ cfg }) => new SchemaSet({
      serviceName: 'notify',
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({ cfg }) => exchanges.reference({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.pulse,
    }),
  },

  db: {
    requires: ['process', 'cfg', 'monitor'],
    setup: ({ process, cfg, monitor }) => tcdb.setup({
      serviceName: 'notify',
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      statementTimeout: process === 'server' ? 30000 : 0,
      monitor: monitor.childMonitor('db'),
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: async ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('notify'), MonitorManager.metricsReference('notify')],
    }).then(ref => ref.generateReferences()),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => {
      return new Client({
        namespace: 'taskcluster-notify',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'pulseClient', 'schemaset'],
    setup: async ({ cfg, pulseClient, schemaset }) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  queueEvents: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.QueueEvents({
      rootUrl: cfg.taskcluster.rootUrl,
    }),
  },

  rateLimit: {
    requires: ['cfg'],
    setup: ({ cfg }) => new RateLimit({
      count: cfg.app.maxMessageCount,
      time: cfg.app.maxMessageTime,
    }),
  },

  ses: {
    requires: ['cfg'],
    setup: ({ cfg }) => new SESv2Client({
      credentials: {
        accessKeyId: cfg.aws.accessKeyId,
        secretAccessKey: cfg.aws.secretAccessKey,
      },
      region: cfg.aws.region || 'us-east-1',
    }),
  },

  denier: {
    requires: ['cfg', 'db'],
    setup: ({ cfg, db }) =>
      new Denier({ emailBlacklist: cfg.app.emailBlacklist, db: db }),
  },

  matrixClient: {
    requires: ['cfg'],
    setup: ({ cfg }) => matrix.createClient({
      ...cfg.matrix,
      localTimeoutMs: 60 * 1000, // We will timeout http requests after 60 seconds. By default this has no timeout.
    }),
  },

  matrix: {
    requires: ['cfg', 'matrixClient', 'monitor'],
    setup: async ({ cfg, matrixClient, monitor }) => {
      let client = new MatrixBot({
        ...cfg.matrix,
        matrixClient,
        monitor: monitor.childMonitor('matrix'),
      });
      if (cfg.matrix.baseUrl) {
        await client.start();
      }
      return client;
    },
  },

  slackClient: {
    requires: ['cfg'],
    setup: ({ cfg }) => cfg.slack.accessToken ?
      new slack.WebClient(cfg.slack.accessToken, {
        slackApiUrl: cfg.slack.apiUrl,
      }) : null,
  },

  slack: {
    requires: ['slackClient', 'monitor'],
    setup({ slackClient, monitor }) {
      if (!slackClient) {
        return null;
      }

      let bot = new SlackBot({
        slackClient,
        monitor: monitor.childMonitor('slack'),
      });
      return bot;
    },
  },

  notifier: {
    requires: ['cfg', 'publisher', 'rateLimit', 'ses', 'denier', 'monitor', 'matrix', 'slack'],
    setup: ({ cfg, publisher, rateLimit, ses, denier, monitor, matrix, slack }) => new Notifier({
      denier,
      publisher,
      rateLimit,
      ses,
      matrix,
      slack,
      sourceEmail: cfg.app.sourceEmail,
      monitor: monitor.childMonitor('notifier'),
    }),
  },

  handler: {
    requires: ['profile', 'cfg', 'monitor', 'notifier', 'pulseClient', 'queue', 'queueEvents'],
    setup: async ({ cfg, monitor, notifier, pulseClient, queue, queueEvents }) => {
      let handler = new Handler({
        rootUrl: cfg.taskcluster.rootUrl,
        notifier,
        monitor: monitor.childMonitor('handler'),
        routePrefix: cfg.app.routePrefix,
        ignoreTaskReasonResolved: cfg.app.ignoreTaskReasonResolved,
        queue,
        queueEvents,
        pulseClient,
      });
      await handler.listen();
      return handler;
    },
  },

  api: {
    requires: ['cfg', 'monitor', 'schemaset', 'notifier', 'denier', 'db'],
    setup: ({ cfg, monitor, schemaset, notifier, denier, db }) => {
      const api = builder.build({
        rootUrl: cfg.taskcluster.rootUrl,
        context: { notifier, denier, db },
        monitor: monitor.childMonitor('api'),
        schemaset,
      });

      monitor.exposeMetrics('default');
      return api;
    },
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({ cfg, api }) => App({
      ...cfg.server,
      apis: [api],
    }),
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
