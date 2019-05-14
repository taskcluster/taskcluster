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

    // Each workertype must choose a single active provider that will do any provisioning on its behalf
    provider: Entity.types.String,

    // If a workertype was previously assigned to another provider and no longer is, it will
    // be added to this field. The provider can then remove any resources created for this
    // workertype and then remove itself from this field when done
    previousProviders: Entity.types.JSON,

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

    // An email address for sending notifications to
    owner: Entity.types.String,

    // If true, an email will be sent to the owner for certain conditions such as provisioning errors
    wantsEmail: Entity.types.Boolean,

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
    wantsEmail: this.wantsEmail,
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
    'wantsEmail',
  ];
  return _.isEqual(_.pick(other, fields), _.pick(this, fields));
};

WorkerType.prototype.reportError = async function({kind, title, description, extra={}, notify}) {
  if (this.wantsEmail) {
    let extraInfo = '';
    if (Object.keys(extra).length) {
      extraInfo = `
        It includes the extra information:

        \`\`\`json
        ${yaml.safeDump(extra)}
        \`\`\`
      `.trim();
    }
    await notify.email({
      address: this.owner,
      subject: `Taskcluster Worker Manager Error: ${title}`,
      content: `
  Worker Manager has encountered an error while trying to provision the workertype ${this.name}:

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  ${description}

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  ${extraInfo}
      `.trim(),
    });
  }
  await WorkerTypeError.create({
    workerType: this.name,
    errorId: slugid.v4(),
    reported: new Date(),
    kind,
    title,
    description,
    extra,
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

    // The provider responsible for this worker
    provider: Entity.types.String,

    // The time that this worker was created
    created: Entity.types.Date,

    // The time that this worker is no longer needed and
    // should be deleted
    expires: Entity.types.Date,

    // A string specifying the state this worker is in
    // so far as worker-manager knows. This can be any
    // of the fields defined in the enum below.
    state: Entity.types.String,

    // Anything a provider may want to remember about this worker
    providerData: Entity.types.JSON,
  },
});

// This is made available to make it slightly less likely that people
// typo worker states. We can change this if there are new requirements
// from providers we make in the future. Will need to make sure that the
// ui handles unknown states gracefully or is updated first.
Worker.states = {
  REQUESTED: 'requested',
  RUNNING: 'running',
  STOPPED: 'stopped',
};

Worker.expire = async () => {
  await this.scan({
    expires: Entity.op.lessThan(new Date()),
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
