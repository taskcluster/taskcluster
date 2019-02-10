const loader = require('taskcluster-lib-loader');
const Monitor = require('taskcluster-lib-monitor');
const docs = require('taskcluster-lib-docs');
const taskcluster = require('taskcluster-client');
const config = require('typed-env-config');
const taskqueue = require('./TaskQueue');

const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => new Monitor({
      projectName: 'taskcluster-built-in-workers',
      level: config.app.level,
      enable: cfg.monitoring.enable,
      mock: profile !== 'production',
      processName: process,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  docs: {
    requires: ['cfg'],
    setup: ({cfg}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      projectName: 'taskcluster-built-in-workers',
      tier: 'core',
      publish: cfg.app.publishMetaData,
      references: [],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
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
  load(process.argv[2]).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

module.exports = load;
