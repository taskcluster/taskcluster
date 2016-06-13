import Debug from 'debug';
import path from 'path';
import base from 'taskcluster-base';
import taskcluster from 'taskcluster-client';
import { Handler } from './handler';
import exchanges from './exchanges';

let debug = Debug('taskcluster-treeherder:main');

let load = base.loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      debug('Configuring validator');
      return base.validator({
        folder: path.join(__dirname, '..', 'schemas'),
        prefix:       'taskcluster-treeherder/v1/',
        aws:           cfg.aws
      });
    }
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => base.monitor({
      project: cfg.monitor.component,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
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
      })
    }
  },

  server: {
    requires: ['cfg', 'publisher', 'validator', 'monitor'],
    setup: async ({cfg, publisher, validator, monitor}) => {
      debug('Configuring handler');
      let queue = new taskcluster.Queue();
      let scheduler = new taskcluster.Scheduler();
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
        listener.bind(queueEvents.taskException(routingPattern))
      ])

      let handler = new Handler({
        queue,
        scheduler,
        listener,
        prefix,
        publisher,
        validator,
        monitor
      });
      handler.start();
    }
  }
}, ['profile', 'process']);

// If this file is executed launch component from first argument
if (!module.parent) {
  load(process.argv[2], {
    profile: process.env.NODE_ENV,
    process: process.argv[2]
  }).catch(err => {
    console.log("Server crashed: " + err.stack);
    process.exit(1);
  });
}

module.exports = load;
