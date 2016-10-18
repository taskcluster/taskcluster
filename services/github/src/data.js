let Entity = require('azure-entities');

module.exports = {};

/**
 * Entity for tracking which task-groups are associated
 * with which org/repo/sha, etc.
 *
 */
module.exports.Build = Entity.configure({
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
});
