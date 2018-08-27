const path = require('path');
const taskcluster = require('taskcluster-client');
const Handler = require('./handler');
const exchanges = require('./exchanges');
const loader = require('taskcluster-lib-loader');
const docs = require('taskcluster-lib-docs');
const config = require('typed-env-config');
const monitor = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return new SchemaSet({
        serviceName: 'treeherder',
        publish: cfg.app.publishMetaData,
        aws: cfg.aws,
      });
    },
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-treeherder',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  validator: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => schemaset.validator(cfg.taskcluster.rootUrl),
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'process', 'monitor', 'validator'],
    setup: async ({cfg, schemaset, process, monitor, validator}) => exchanges.setup({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.pulse.credentials,
      validator,
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('publisher'),
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'integrations',
      schemaset,
      references: [
        {
          name: 'events',
          reference: exchanges.reference({
            rootUrl: cfg.taskcluster.rootUrl,
            credentials: cfg.pulse.credentials,
          }),
        },
      ],
    }),
  },

  server: {
    requires: ['cfg', 'publisher', 'schemaset', 'monitor', 'docs', 'validator'],
    setup: async ({cfg, publisher, schemaset, monitor, docs, validator}) => {
      const queue = new taskcluster.Queue({
        rootUrl: cfg.taskcluster.rootUrl,
      });
      const queueEvents = new taskcluster.QueueEvents({
        rootUrl: cfg.taskcluster.rootUrl,
      });

      // TODO add queue name for durable queues
      let listener = new taskcluster.PulseListener({
        credentials: cfg.pulse.credentials,
        queueName: cfg.pulse.queueName,
        prefetch: cfg.pulse.prefetch,
      });

      let prefix = cfg.treeherder.routePrefix;
      let routingPattern = `route.${prefix}.#`;
      await Promise.all([
        listener.bind(queueEvents.taskPending(routingPattern)),
        listener.bind(queueEvents.taskRunning(routingPattern)),
        listener.bind(queueEvents.taskCompleted(routingPattern)),
        listener.bind(queueEvents.taskFailed(routingPattern)),
        listener.bind(queueEvents.taskException(routingPattern)),
      ]);

      let handler = new Handler({
        cfg,
        queue,
        listener,
        prefix,
        publisher,
        validator,
        monitor,
      });
      handler.start();
    },
  },
}, ['profile', 'process']);

// If this file is executed launch component from first argument
if (!module.parent) {
  load(process.argv[2], {
    profile: process.env.NODE_ENV,
    process: process.argv[2],
  }).catch(err => {
    console.log('Server crashed: ' + err.stack);
    process.exit(1);
  });
}

module.exports = load;
