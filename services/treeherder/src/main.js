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

  // TODO add statsum client
  drain: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return new base.stats.NullDrain();
    }
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

  publisher: {
    requires: ['cfg', 'validator', 'drain', 'process'],
    setup: ({cfg, validator, drain, process}) => {
      debug('Configuring exchanges');
      return exchanges.setup({
        credentials:      cfg.pulse.credentials,
        exchangePrefix:   cfg.app.exchangePrefix,
        validator:        validator,
        referencePrefix:  'taskcluster-treeherder/v1/exchanges.json',
        publish:          cfg.app.publishMetaData,
        aws:              cfg.aws,
        drain:            drain,
        component:        cfg.app.statsComponent,
        process,
      })
    }
  },

  server: {
    requires: ['cfg', 'publisher', 'validator'],
    setup: async ({cfg, publisher, validator}) => {
      debug('Configuring handler');
      let queue = new taskcluster.Queue();
      let scheduler = new taskcluster.Scheduler();
      let queueEvents = new taskcluster.QueueEvents();

      // TODO add queue name for durable queues
      let listener = new taskcluster.PulseListener({
        credentials: cfg.pulse.credentials,
        queueName: cfg.pulse.queueName
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
        validator
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
