import { MonitorManager } from 'taskcluster-lib-monitor';

export const monitor = MonitorManager.setup({
  serviceName: 'client',
  fake: true,
  debug: true,
  verify: true,
});

export const monitorManager = monitor.manager;

export default { monitor, monitorManager };
