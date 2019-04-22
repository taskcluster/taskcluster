const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'worker-manager',
});

manager.register({
  name: 'workertypeProvisioned',
  title: 'Workertype Provisioned',
  type: 'workertype-provisioned',
  version: 1,
  level: 'info',
  description: 'A workerType\'s provisioning run has completed',
  fields: {
    workerType: 'The name of the workertype.',
    provider: 'The name of the provider that did the work for this workertype.',
  },
});

module.exports = manager;
