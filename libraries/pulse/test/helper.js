import { Secrets, withMonitor } from 'taskcluster-lib-testing';
import { MonitorManager } from 'taskcluster-lib-monitor';

withMonitor(exports, { noLoader: true });

export const monitor = MonitorManager.setup({
  serviceName: 'lib-pulse',
  fake: true,
  debug: true,
  validate: true,
});

export const secrets = new Secrets({
  secretName: [],
  secrets: {
    pulse: [
      { env: 'PULSE_CONNECTION_STRING', name: 'connectionString' },
    ],
  },
});
