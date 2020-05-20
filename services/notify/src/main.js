require('../../prelude');
const aws = require('aws-sdk');
const {Client, pulseCredentials} = require('taskcluster-lib-pulse');
const {App} = require('taskcluster-lib-app');
const loader = require('taskcluster-lib-loader');
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const libReferences = require('taskcluster-lib-references');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const {MonitorManager} = require('taskcluster-lib-monitor');
const builder = require('./api');
const Notifier = require('./notifier');
const RateLimit = require('./ratelimit');
const Denier = require('./denier');
const Handler = require('./handler');
const exchanges = require('./exchanges');
const IRC = require('./irc');
const matrix = require('matrix-js-sdk');
const MatrixBot = require('./matrix');
const data = require('./data');
const tcdb = require('taskcluster-db');

require('./monitor');

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({
      profile,
      serviceName: 'notify',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => MonitorManager.setup({
      serviceName: 'notify',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'notify',
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.pulse,
    }),
  },

  DenylistedNotification: {
    requires: ['cfg', 'monitor', 'process', 'db'],
    setup: ({cfg, monitor, process, db}) => data.DenylistedNotification.setup({
      db,
      serviceName: 'notify',
      tableName: cfg.app.denylistedNotificationTableName,
      monitor: monitor.childMonitor('table.denylist'),
    }),
  },

  db: {
    requires: ['process', 'cfg', 'monitor'],
    setup: ({process, cfg, monitor}) => tcdb.setup({
      serviceName: 'notify',
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      statementTimeout: process === 'server' ? 30000 : 0,
      monitor: monitor.childMonitor('db'),
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('notify')],
    }).generateReferences(),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new Client({
        namespace: 'taskcluster-notify',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'pulseClient', 'schemaset'],
    setup: async ({cfg, pulseClient, schemaset}) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  queueEvents: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.QueueEvents({
      rootUrl: cfg.taskcluster.rootUrl,
    }),
  },

  rateLimit: {
    requires: ['cfg'],
    setup: ({cfg}) => new RateLimit({
      count: cfg.app.maxMessageCount,
      time: cfg.app.maxMessageTime,
    }),
  },

  ses: {
    requires: ['cfg'],
    setup: ({cfg}) => new aws.SES(cfg.aws),
  },

  denier: {
    requires: ['cfg', 'DenylistedNotification'],
    setup: ({cfg, DenylistedNotification}) =>
      new Denier({DenylistedNotification, emailBlacklist: cfg.app.emailBlacklist}),
  },

  matrixClient: {
    requires: ['cfg'],
    setup: ({cfg}) => matrix.createClient({
      ...cfg.matrix,
      localTimeoutMs: 60 * 1000, // We will timeout http requests after 60 seconds. By default this has no timeout.
    }),
  },

  matrix: {
    requires: ['cfg', 'matrixClient', 'monitor'],
    setup: async ({cfg, matrixClient, monitor}) => {
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

  notifier: {
    requires: ['cfg', 'publisher', 'rateLimit', 'ses', 'denier', 'monitor', 'matrix'],
    setup: ({cfg, publisher, rateLimit, ses, denier, monitor, matrix}) => new Notifier({
      denier,
      publisher,
      rateLimit,
      ses,
      matrix,
      sourceEmail: cfg.app.sourceEmail,
      monitor: monitor.childMonitor('notifier'),
    }),
  },

  irc: {
    requires: ['cfg', 'pulseClient', 'monitor', 'reference'],
    setup: async ({cfg, pulseClient, monitor, reference}) => {
      let client = new IRC(_.merge(cfg.irc, {
        monitor: monitor.childMonitor('irc'),
        pulseClient,
        reference,
        rootUrl: cfg.taskcluster.rootUrl,
      }));
      await client.start();
      return client;
    },
  },

  handler: {
    requires: ['profile', 'cfg', 'monitor', 'notifier', 'pulseClient', 'queue', 'queueEvents'],
    setup: async ({cfg, monitor, notifier, pulseClient, queue, queueEvents}) => {
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
    requires: ['cfg', 'monitor', 'schemaset', 'notifier', 'DenylistedNotification', 'denier', 'db'],
    setup: ({cfg, monitor, schemaset, notifier, DenylistedNotification, denier, db}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {notifier, DenylistedNotification, denier, db},
      monitor: monitor.childMonitor('api'),
      schemaset,
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
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
