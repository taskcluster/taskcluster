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
    workertype: 'The name of the workertype.',
    pending: 'The pending count from the queue for this type.',
  },
});

module.exports = manager;
