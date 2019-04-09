const Entity = require('azure-entities');

const WorkerType = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('name'),
  rowKey: Entity.keys.ConstantKey('workerType'),
  properties: {
    name: Entity.types.String,
    provider: Entity.types.String,
    description: Entity.types.String,
    created: Entity.types.Date,
    lastModified: Entity.types.Date,
    configTemplate: Entity.types.JSON,
    renderedConfig: Entity.types.JSON,
    // Add an owner field
  },
});

WorkerType.prototype.serializable = function() {
  return {
    name: this.name,
    provider: this.provider,
    description: this.description,
    created: this.created.toJSON(),
    lastModified: this.lastModified.toJSON(),
    configTemplate: this.configTemplate,
    renderedConfig: this.renderedConfig,
  };
};

module.exports = {
  WorkerType,
};
