const aws = require('aws-sdk');
const {Client, pulseCredentials} = require('taskcluster-lib-pulse');
const App = require('taskcluster-lib-app');
const loader = require('taskcluster-lib-loader');
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const libReferences = require('taskcluster-lib-references');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const monitorManager = require('./monitor');
const builder = require('./api');
const Notifier = require('./notifier');
const RateLimit = require('./ratelimit');
const Denier = require('./denier');
const Handler = require('./handler');
const exchanges = require('./exchanges');
const IRC = require('./irc');
const data = require('./data');
const {sasCredentials} = require('taskcluster-lib-azure');

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitorManager.setup({
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
    requires: ['cfg', 'monitor', 'process'],
    setup: ({cfg, monitor, process}) => data.DenylistedNotification.setup({
      tableName: cfg.app.denylistedNotificationTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.denylistedNotificationTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.childMonitor('table.denylist'),
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), monitorManager.reference()],
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

  notifier: {
    requires: ['cfg', 'publisher', 'rateLimit', 'ses', 'denier', 'monitor'],
    setup: ({cfg, publisher, rateLimit, ses, denier, monitor}) => new Notifier({
      denier,
      publisher,
      rateLimit,
      ses,
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
    requires: ['cfg', 'monitor', 'schemaset', 'notifier', 'DenylistedNotification', 'denier'],
    setup: ({cfg, monitor, schemaset, notifier, DenylistedNotification, denier}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {notifier, DenylistedNotification, denier},
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
