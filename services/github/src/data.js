const Entity = require('azure-entities');

/**
 * Entity for tracking which task-groups are associated
 * with which org/repo/sha, etc.
 *
 */
module.exports.Builds = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskGroupId'),
  rowKey: Entity.keys.ConstantKey('taskGroupId'),
  properties: {
    organization: Entity.types.String,
    repository: Entity.types.String,
    sha: Entity.types.String,
    taskGroupId: Entity.types.String,
    state: Entity.types.String,
    created: Entity.types.Date,
    updated: Entity.types.Date,
  },
}).configure({
  version: 2,
  properties: {
    organization: Entity.types.String,
    repository: Entity.types.String,
    sha: Entity.types.String,
    taskGroupId: Entity.types.String,
    state: Entity.types.String,
    created: Entity.types.Date,
    updated: Entity.types.Date,
    // GitHub installation ID that comes from the webhook
    // Needed for authentication in statusHandler
    installationId: Entity.types.Number,
  },
  migrate: function(item) {
    item.installationId = 0;
    return item;
  },
}).configure({
  version: 3,
  properties: {
    organization: Entity.types.String,
    repository: Entity.types.String,
    sha: Entity.types.String,
    taskGroupId: Entity.types.String,
    state: Entity.types.String,
    created: Entity.types.Date,
    updated: Entity.types.Date,
    installationId: Entity.types.Number,
    eventType: Entity.types.String,
  },
  migrate: function(item) {
    item.eventType = 'Unknown Event';
    return item;
  },
}).configure({
  version: 4,
  properties: {
    organization: Entity.types.String,
    repository: Entity.types.String,
    sha: Entity.types.String,
    taskGroupId: Entity.types.String,
    state: Entity.types.String,
    created: Entity.types.Date,
    updated: Entity.types.Date,
    installationId: Entity.types.Number,
    eventType: Entity.types.String,
    eventId: Entity.types.String,
  },
  migrate: function(item) {
    item.Id = 'Unknown';
    return item;
  },
}).configure({
  version: 5,
  properties: {
    organization: Entity.types.String,
    repository: Entity.types.String,
    sha: Entity.types.String,
    taskGroupId: Entity.types.String,
    state: Entity.types.String,
    created: Entity.types.Date,
    updated: Entity.types.Date,
    installationId: Entity.types.Number,
    eventType: Entity.types.String,
    eventId: Entity.types.String,
  },
  migrate: function(item) {
    // Delete Id because it was mistakenly set in the last migration
    delete item.Id; // Just in case the migrations are chained
    item.eventId = item.eventId || 'Unknown';
    return item;
  },
});

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
