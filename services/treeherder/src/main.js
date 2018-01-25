const Debug = require('debug');
const path = require('path');
const taskcluster = require('taskcluster-client');
const Handler = require('./handler');
const exchanges = require('./exchanges');
const loader = require('taskcluster-lib-loader');
const docs = require('taskcluster-lib-docs');
const config = require('typed-env-config');
const monitor = require('taskcluster-lib-monitor');
const validator = require('taskcluster-lib-validate');

let debug = Debug('taskcluster-treeherder:main');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      debug('Configuring validator');
      return validator({
        prefix:       'taskcluster-treeherder/v1/',
        aws:           cfg.aws,
      });
    },
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: cfg.monitor.component,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      exchangePrefix:   cfg.app.exchangePrefix,
      credentials:      cfg.pulse.credentials,
    }),
  },

  publisher: {
    requires: ['cfg', 'validator', 'process', 'monitor'],
    setup: ({cfg, validator, process, monitor}) => {
      debug('Configuring exchanges');
      return exchanges.setup({
        credentials:      cfg.pulse.credentials,
        exchangePrefix:   cfg.app.exchangePrefix,
        validator:        validator,
        referencePrefix:  'taskcluster-treeherder/v1/exchanges.json',
        publish:          cfg.app.publishMetaData,
        aws:              cfg.aws,
        monitor: monitor.prefix('publisher'),
        process,
      });
    },
  },

  docs: {
    requires: ['cfg', 'validator', 'reference'],
    setup: ({cfg, validator, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'integrations',
      schemas: validator.schemas,
      references: [
        {
          name: 'events',
          reference: reference,
        },
      ],
    }),
  },

  server: {
    requires: ['cfg', 'publisher', 'validator', 'monitor', 'docs'],
    setup: async ({cfg, publisher, validator, monitor, docs}) => {
      debug('Configuring handler');
      let queue = new taskcluster.Queue();
      let queueEvents = new taskcluster.QueueEvents();

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
