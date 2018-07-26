const debug = require('debug')('notify');
const aws = require('aws-sdk');
const App = require('taskcluster-lib-app');
const loader = require('taskcluster-lib-loader');
const config = require('typed-env-config');
const monitor = require('taskcluster-lib-monitor');
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

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: cfg.monitoring.project || 'taskcluster-notify',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
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
      rootUrl:          cfg.taskcluster.rootUrl,
      credentials:      cfg.pulse,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset', 'reference'],
    setup: async ({cfg, schemaset, reference}) => await docs.documenter({
      credentials: cfg.taskcluster.credentials,
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

  publisher: {
    requires: ['cfg', 'schemaset', 'monitor'],
    setup: async ({cfg, schemaset, monitor}) => exchanges.setup({
      rootUrl:            cfg.taskcluster.rootUrl,
      credentials:        cfg.pulse,
      validator:          await schemaset.validator(cfg.taskcluster.rootUrl),
      publish:            cfg.app.publishMetaData,
      aws:                cfg.aws,
      monitor:            monitor.prefix('publisher'),
    }),
  },

  listener: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.PulseListener({
      credentials: cfg.pulse,
      queueName: cfg.app.listenerQueueName,
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
    setup: ({cfg}) => new aws.SES({
      params: {
        Source: cfg.app.sourceEmail,
      },
      ...cfg.aws,
    }),
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
    requires: ['profile', 'cfg', 'monitor', 'notifier', 'listener', 'queue', 'queueEvents'],
    setup: async ({profile, cfg, monitor, notifier, listener, queue, queueEvents}) => {
      let handler = new Handler({
        notifier,
        monitor:                  monitor.prefix('handler'),
        routePrefix:              cfg.app.routePrefix,
        ignoreTaskReasonResolved: cfg.app.ignoreTaskReasonResolved,
        listener,
        queue,
        queueEvents,
        testing:                  profile === 'test',
      });
      await handler.listen();
      return handler;
    },
  },

  api: {
    requires: ['cfg', 'monitor', 'schemaset', 'notifier'],
    setup: ({cfg, monitor, schemaset, notifier}) => builder.build({
      rootUrl:          cfg.taskcluster.rootUrl,
      context:          {notifier},
      publish:          cfg.app.publishMetaData,
      aws:              cfg.aws,
      monitor:          monitor.prefix('api'),
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

}, ['profile', 'process']);

// If this file is executed launch component from first argument
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
