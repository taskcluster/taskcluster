const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'queue',
});

manager.register({
  name: 'resolvedQueuePoll',
  type: 'resolved-queue-poll',
  version: 1,
  level: 'info',
  description: 'Report result of polling messages from an azure queue.',
  fields: {
    messages: 'Number of messages fetched.',
    failed: 'Number of these messages that failed to be handled.',
    resolver: 'The name of the resolver that polled the queue.',
  },
});

manager.register({
  name: 'workClaimed',
  type: 'work-claimed',
  version: 1,
  level: 'notice',
  description: 'Results of a claimWork from a worker.',
  fields: {
    provisionerId: 'Provisioner that provisioned the worker claiming work.',
    workerType: 'Type of worker claiming work.',
    workerGroup: 'Group of worker claiming work.',
    workerId: 'The id of the claiming worker.',
    requested: 'The number of tasks the worker requested.',
    tasks: 'An array of taskId that were given to the worker.',
  },
});

manager.register({
  name: 'hintPoller',
  type: 'hint-poller',
  version: 1,
  level: 'info',
  description: 'Metrics of an iteration of the hint poller.',
  fields: {
    claimed: 'Number of hints claimed on an iteration.',
    released: 'Number of hints released on an iteration. Should usually be 0.',
    slept: 'If true, there were no hints to claim and the poller slept before claiming again.',
  },
});

module.exports = manager;
