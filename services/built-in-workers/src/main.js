import '../../prelude.js';
import loader from '@taskcluster/lib-loader';
import { MonitorManager } from '@taskcluster/lib-monitor';
import libReferences from '@taskcluster/lib-references';
import taskcluster from '@taskcluster/client';
import config from '@taskcluster/lib-config';
import TaskQueue from './TaskQueue.js';
import { fileURLToPath } from 'node:url';

const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => config({
      profile,
      serviceName: 'built-in-workers',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({ process, profile, cfg }) => MonitorManager.setup({
      serviceName: 'built-in-workers',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  generateReferences: {
    requires: [],
    setup: async () => libReferences.fromService({
      references: [MonitorManager.reference('built-in-workers'), MonitorManager.metricsReference('built-in-workers')],
    }).then(ref => ref.generateReferences()),
  },

  succeedTaskQueue: {
    requires: ['queue', 'monitor'],
    setup: ({ queue, monitor }) => new TaskQueue(queue, monitor.childMonitor('succeed'), 'succeed'),
  },

  failTaskQueue: {
    requires: ['queue', 'monitor'],
    setup: ({ queue, monitor }) => new TaskQueue(queue, monitor.childMonitor('fail'), 'fail'),
  },

  server: {
    requires: ['succeedTaskQueue', 'failTaskQueue'],
    setup: async ({ failTaskQueue, succeedTaskQueue }) => {
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  load.crashOnError(process.argv[2]);
}

export default load;
