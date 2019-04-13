const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'worker-manager',
});

manager.register({
  name: 'workertypeProvision',
  title: 'Workertype Provisioning',
  type: 'workertype-provision',
  version: 1,
  level: 'info',
  description: 'The results of a single provisioner iteration for a workertype.',
  fields: {
    workerType: 'The name of the workertype.',
    provider: 'The name of the provider that did the work for this workertype.',
  },
});

module.exports = manager;
