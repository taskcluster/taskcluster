const Entity = require('taskcluster-lib-entities');

module.exports.OwnersDirectory = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('owner'),
  rowKey: Entity.keys.ConstantKey('someConstant'),
  properties: {
    installationId: Entity.types.Number,
    owner: Entity.types.String,
  },
});

module.exports.CheckRuns = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskGroupId'),
  rowKey: Entity.keys.StringKey('taskId'),
  properties: {
    taskGroupId: Entity.types.String,
    taskId: Entity.types.String,
    checkSuiteId: Entity.types.String,
    checkRunId: Entity.types.String,
  },
});

module.exports.ChecksToTasks = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('checkSuiteId'),
  rowKey: Entity.keys.StringKey('checkRunId'),
  properties: {
    taskGroupId: Entity.types.String,
    taskId: Entity.types.String,
    checkSuiteId: Entity.types.String,
    checkRunId: Entity.types.String,
  },
});
