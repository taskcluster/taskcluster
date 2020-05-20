require('../../prelude');
const loader = require('taskcluster-lib-loader');
const {MonitorManager} = require('taskcluster-lib-monitor');
const libReferences = require('taskcluster-lib-references');
const taskcluster = require('taskcluster-client');
const config = require('taskcluster-lib-config');
const taskqueue = require('./TaskQueue');

const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({
      profile,
      serviceName: 'built-in-workers',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => MonitorManager.setup({
      serviceName: 'built-in-workers',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  generateReferences: {
    requires: ['cfg'],
    setup: ({cfg}) => libReferences.fromService({
      references: [MonitorManager.reference('built-in-workers')],
    }).generateReferences(),
  },

  succeedTaskQueue: {
    requires: ['queue', 'cfg'],
    setup: ({cfg, queue}) => new taskqueue.TaskQueue(cfg, queue, 'succeed'),
  },

  failTaskQueue: {
    requires: ['queue', 'cfg'],
    setup: ({cfg, queue}) => new taskqueue.TaskQueue(cfg, queue, 'fail'),
  },

  server: {
    requires: ['succeedTaskQueue', 'failTaskQueue'],
    setup: async ({failTaskQueue, succeedTaskQueue}) => {
      await Promise.all([
        succeedTaskQueue.runWorker(),
        failTaskQueue.runWorker(),
      ]);
    },
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
