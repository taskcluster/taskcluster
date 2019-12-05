const _ = require('lodash');
const slugid = require('slugid');
const yaml = require('js-yaml');
const Entity = require('azure-entities');

const WorkerPool = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('workerPoolId'),
  rowKey: Entity.keys.ConstantKey('workerPool'),
  properties: {
    workerPoolId: Entity.types.String,
    providerId: Entity.types.String,
    previousProviderIds: Entity.types.JSON,
    description: Entity.types.String,
    scheduledForDeletion: Entity.types.Boolean,
    created: Entity.types.Date,
    lastModified: Entity.types.Date,
    config: Entity.types.JSON,
    owner: Entity.types.String,
    emailOnError: Entity.types.Boolean,
    providerData: Entity.types.JSON,
  },
  context: [
    // Monitor instance
    'monitor',
    // Notify client instance
    'notify',
    // set-up WorkerPoolError Entity instance
    'WorkerPoolError',
  ],
}).configure({
  version: 2,
  properties: {
    // A unique name for this worker pool. This is a workerPoolId, so must be
    // of the form `<provisionerId>/<workerType>`
    workerPoolId: Entity.types.String,

    // Each workerPool must choose a single active provider that will do any provisioning on its behalf
    providerId: Entity.types.String,

    // If a workerPool was previously assigned to another provider and no longer is, it will
    // be added to this field. The provider can then remove any resources created for this
    // workerPool and then remove itself from this field when done
    previousProviderIds: Entity.types.JSON,

    // A useful human-readable description of what this workerPool is for
    description: Entity.types.String,

    // A timestamp of when this workerPool was initially created
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
    emailOnError: Entity.types.Boolean,

    // Providers can use this to remember values between provisioning runs
    providerData: Entity.types.JSON,
  },
  migrate(item) {
    delete item.scheduledForDeletion;
  },
  context: [
    // Monitor instance
    'monitor',
    // Notify client instance
    'notify',
    // set-up WorkerPoolError Entity instance
    'WorkerPoolError',
  ],
});

WorkerPool.prototype.serializable = function() {
  return {
    workerPoolId: this.workerPoolId,
    providerId: this.providerId,
    description: this.description,
    created: this.created.toJSON(),
    lastModified: this.lastModified.toJSON(),
    config: this.config,
    owner: this.owner,
    emailOnError: this.emailOnError,
  };
};

WorkerPool.prototype.compare = function(other) {
  const fields = [
    'workerPoolId',
    'providerId',
    'description',
    'created',
    'lastModified',
    'config',
    'owner',
    'emailOnError',
  ];
  return _.isEqual(_.pick(other, fields), _.pick(this, fields));
};

WorkerPool.expire = async function(monitor) {
  // delete any worker pools with providerId `null` and no other
  // previousProviderIds
  await this.scan({}, {
    limit: 500,
    handler: async item => {
      if (item.providerId === 'null-provider' && item.previousProviderIds.length === 0) {
        monitor.info(`deleting worker pool ${item.workerPoolId}`);
        await item.remove();
      }
    },
  });
};

WorkerPool.prototype.reportError = async function({kind, title, description, extra = {}}) {
  const errorId = slugid.v4();

  try {
    if (this.emailOnError) {
      await this.notify.email({
        address: this.owner,
        subject: `Taskcluster Worker Manager Error: ${title}`,
        content: getExtraInfo({extra, description, workerPoolId: this.workerPoolId, errorId}),
      });
    }

    await this.monitor.log.workerError({
      workerPoolId: this.workerPoolId,
      errorId,
      reported: new Date(),
      kind,
      title,
      description,
    });

  } finally {
    // eslint-disable-next-line no-unsafe-finally
    return await this.WorkerPoolError.create({
      workerPoolId: this.workerPoolId,
      errorId,
      reported: new Date(),
      kind,
      title,
      description,
      extra,
    });
  }
};

const WorkerPoolError = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('workerPoolId'),
  rowKey: Entity.keys.StringKey('errorId'),
  properties: {
    // The worker pool this maps to.
    workerPoolId: Entity.types.String,

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

WorkerPoolError.prototype.serializable = function() {
  return {
    workerPoolId: this.workerPoolId,
    errorId: this.errorId,
    reported: this.reported.toJSON(),
    kind: this.kind,
    title: this.title,
    description: this.description,
    extra: this.extra,
  };
};

WorkerPoolError.expire = async function(threshold) {
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
  partitionKey: Entity.keys.StringKey('workerPoolId'),
  rowKey: Entity.keys.CompositeKey('workerGroup', 'workerId'),
  properties: {
    // The worker pool this maps to.
    workerPoolId: Entity.types.String,

    // The group and id of this worker
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,

    // The provider responsible for this worker
    providerId: Entity.types.String,

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
}).configure({
  version: 2,
  properties: {
    // The worker pool this maps to.
    workerPoolId: Entity.types.String,

    // The group and id of this worker
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,

    // The provider responsible for this worker
    providerId: Entity.types.String,

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

    // Number of tasks this worker can run at one time
    capacity: Entity.types.Number,

    // Last time that worker-manager updated the state of this
    // worker
    lastModified: Entity.types.Date,

    // Last time that worker-manager checked on the state
    // of this worker in the outside world by checking with
    // a cloud provider or something else
    lastChecked: Entity.types.Date,
  },
  migrate(item) {
    item.lastModified = new Date();
    item.lastChecked = new Date();
    if (item.providerData.instanceCapacity) {
      item.capacity = item.providerData.instanceCapacity;
    } else {
      item.capacity = 1;
    }
    return item;
  },
});

Worker.prototype.serializable = function() {
  return {
    workerPoolId: this.workerPoolId,
    workerGroup: this.workerGroup,
    workerId: this.workerId,
    providerId: this.providerId,
    created: this.created.toJSON(),
    expires: this.expires.toJSON(),
    lastModified: this.lastModified.toJSON(),
    lastChecked: this.lastChecked.toJSON(),
    capacity: this.capacity,
    state: this.state,
  };
};

// This is made available to make it slightly less likely that people
// typo worker states. We can change this if there are new requirements
// from providers we make in the future. Will need to make sure that the
// ui handles unknown states gracefully or is updated first.
Worker.states = {
  REQUESTED: 'requested',
  RUNNING: 'running',
  STOPPED: 'stopped',
};

Worker.expire = async function(monitor) {
  await this.scan({
    expires: Entity.op.lessThan(new Date()),
  }, {
    limit: 500,
    handler: async item => {
      monitor.info(`deleting expired worker ${item.workerGroup}/${item.workerId}`);
      await item.remove();
    },
  });
};

module.exports = {
  Worker,
  WorkerPool,
  WorkerPoolError,
};

const getExtraInfo = ({extra, workerPoolId, description, errorId}) => {
  let extraInfo = '';
  if (Object.keys(extra).length) {
    extraInfo = `
It includes the extra information:

\`\`\`
${yaml.safeDump(extra)}
\`\`\`
      `.trim();
  }

  return `Worker Manager has encountered an error while trying to provision the worker pool ${workerPoolId}:

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

${description}

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

ErrorId: ${errorId}

${extraInfo}`.trim();
};
