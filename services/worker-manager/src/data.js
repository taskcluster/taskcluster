const _ = require('lodash');
const slugid = require('slugid');
const yaml = require('js-yaml');
const Entity = require('azure-entities');

const WorkerType = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('name'),
  rowKey: Entity.keys.ConstantKey('workerType'),
  properties: {
    // A unique name for this workertype. This maps to a workertype name in tc-queue.
    name: Entity.types.String,

    // Each workertype must choose a single "provider" that will do any provisioning on its behalf
    provider: Entity.types.String,

    // A useful human-readable description of what this workertype is for
    description: Entity.types.String,

    // If this is true, a provider should clean up any resources with this and then delete it
    scheduledForDeletion: Entity.types.Boolean,

    // A timestamp of when this workertype was initially created
    created: Entity.types.Date,

    // A timestamp of when configuration data was last modified. This does not count for things like
    // errors or providerData
    lastModified: Entity.types.Date,

    // The contents of this will be different based on which provider is selected. The providers must
    // provide some sort of schema for this.
    config: Entity.types.JSON,

    // An email address that gets a notification when there is an error provisioning
    owner: Entity.types.String,

    // Providers can use this to remember values between provisioning runs
    providerData: Entity.types.JSON,
  },
});

WorkerType.prototype.serializable = function() {
  return {
    name: this.name,
    provider: this.provider,
    description: this.description,
    created: this.created.toJSON(),
    lastModified: this.lastModified.toJSON(),
    config: this.config,
    scheduledForDeletion: this.scheduledForDeletion,
    owner: this.owner,
  };
};

WorkerType.prototype.compare = function(other) {
  const fields = [
    'name',
    'provider',
    'description',
    'created',
    'lastModified',
    'config',
    'scheduledForDeletion',
    'owner',
  ];
  return _.isEqual(_.pick(other, fields), _.pick(this, fields));
};

WorkerType.prototype.reportError = async ({kind, title, description, extra, notify, owner}) => {
  await WorkerTypeError.create({
    workerType: this.name,
    errorId: slugid.v4(),
    reported: new Date(),
    kind,
    title,
    description,
    extra,
  });
  await notify.email({
    address: owner,
    subject: `Taskcluster Worker Manager Error: ${title}`,
    content: `
Worker Manager has encountered an error while trying to provision the workertype ${this.name}:

\`\`\`
${description}
\`\`\`

It includes the extra information:

\`\`\`json
${yaml.safeDump(extra)}
\`\`\`
    `.trim(),
  });
};

const WorkerTypeError = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('workerType'),
  rowKey: Entity.keys.StringKey('errorId'),
  properties: {
    // The workertype this maps to.
    workerType: Entity.types.String,

    // An arbitrary id for this error
    errorId: Entity.types.SlugId,

    // The datetime this error occured
    reported: Entity.types.Date,

    // The sort of error this is. Can be used by UIs to differentiate
    kind: Entity.types.String,

    // A human readable name for this error
    title: Entity.types.String,

    // A human readable description of this error and what can be done to fix it
    description: Entity.types.String,

    // Anything else that a reporter may want to add in a structured way
    extra: Entity.types.JSON,
  },
});

WorkerTypeError.prototype.serializable = function() {
  return {
    workerType: this.workerType,
    errorId: this.errorId,
    reported: this.reported.toJSON(),
    kind: this.kind,
    title: this.title,
    description: this.description,
    extra: this.extra,
  };
};

WorkerTypeError.expire = async (threshold) => {
  await this.scan({
    reported: Entity.op.lessThan(threshold),
  }, {
    limit: 500,
    handler: async item => {
      await item.remove();
    },
  });
};

const Worker = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('workerType'),
  rowKey: Entity.keys.StringKey('workerId'),
  properties: {
    // The workertype this maps to.
    workerType: Entity.types.String,

    // The id of this worker
    workerId: Entity.types.String,

    // The time that this worker requested credentials
    credentialed: Entity.types.Date,
  },
});

Worker.expire = async (threshold) => {
  await this.scan({
    credentialed: Entity.op.lessThan(threshold),
  }, {
    limit: 500,
    handler: async item => {
      await item.remove();
    },
  });
};

module.exports = {
  Worker,
  WorkerType,
  WorkerTypeError,
};
