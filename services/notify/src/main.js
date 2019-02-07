const debug = require('debug')('notify');
const aws = require('aws-sdk');
const {Client, pulseCredentials} = require('taskcluster-lib-pulse');
const App = require('taskcluster-lib-app');
const loader = require('taskcluster-lib-loader');
const config = require('typed-env-config');
const Monitor = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');
const docs = require('taskcluster-lib-docs');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const builder = require('./api');
const Notifier = require('./notifier');
const RateLimit = require('./ratelimit');
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
    setup: ({process, profile, cfg}) => new Monitor({
      projectName: cfg.monitoring.project || 'taskcluster-notify',
      enable: cfg.monitoring.enable,
      mock: profile === 'test',
      processName: process,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'notify',
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
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
      monitor: monitor.prefix('table.denylist'),
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset', 'reference'],
    setup: async ({cfg, schemaset, reference}) => await docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-notify',
      tier: 'core',
      publish: cfg.app.publishMetaData,
      schemaset,
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

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new Client({
        namespace: cfg.pulse.namespace,
        monitor,
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
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
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

  sqs: {
    requires: ['cfg'],
    setup: ({cfg}) => new aws.SQS({
      ...cfg.aws,
    }),
  },

  notifier: {
    requires: ['cfg', 'publisher', 'rateLimit', 'ses', 'sqs'],
    setup: async ({cfg, publisher, rateLimit, ses, sqs}) => {
      const n = new Notifier({
        queueName: cfg.app.sqsQueueName,
        emailBlacklist: cfg.app.emailBlacklist,
        publisher,
        rateLimit,
        ses,
        sqs,
        sourceEmail: cfg.app.sourceEmail,
      });
      await n.setup();
      return n;
    },
  },

  irc: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      monitor = monitor.prefix('irc');
      let client = new IRC(_.merge(cfg.irc, {
        aws: cfg.aws,
        queueName: cfg.app.sqsQueueName,
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
        monitor: monitor.prefix('handler'),
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
    requires: ['cfg', 'monitor', 'schemaset', 'notifier', 'DenylistedNotification'],
    setup: ({cfg, monitor, schemaset, notifier, DenylistedNotification}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {notifier, DenylistedNotification},
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('api'),
      schemaset,
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => App({
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
  load(process.argv[2]).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

module.exports = load;
