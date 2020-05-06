const _ = require('lodash');
const Entity = require('taskcluster-lib-entities');
const {UNIQUE_VIOLATION} = require('taskcluster-lib-postgres');

class WorkerPool {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new WorkerPool({
      workerPoolId: row.worker_pool_id,
      providerId: row.provider_id,
      description: row.description,
      created: row.created,
      lastModified: row.last_modified,
      config: row.config,
      owner: row.owner,
      emailOnError: row.email_on_error,
      previousProviderIds: row.previous_provider_ids,
      providerData: row.provider_data,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_worker_pool.
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return WorkerPool.fromDb(rows[0]);
    }
  }

  // Create an instance from API arguments, with default values applied.
  static fromApi(input) {
    const now = new Date();
    return new WorkerPool({
      previousProviderIds: [],
      providerData: {},
      lastModified: now,
      created: now,
      ...input,
    });
  }

  // Get a worker pool from the DB, or undefined if it does not exist.
  static async get(db, workerPoolId) {
    return WorkerPool.fromDbRows(await db.fns.get_worker_pool(workerPoolId));
  }

  // Expire worker pools with null-provider that no longer have any workers,
  // returning the list of worker pools expired.
  static async expire({db, monitor}) {
    const rows = await db.fns.expire_worker_pools();
    return rows.map(row => row.worker_pool_id);
  }

  // Call db.create_worker_pool with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    try {
      await db.fns.create_worker_pool(
        this.workerPoolId,
        this.providerId,
        // node-pg cannot correctly encode JS arrays as JSONB
        // https://github.com/brianc/node-postgres/issues/2012
        JSON.stringify(this.previousProviderIds),
        this.description,
        this.config,
        this.created,
        this.lastModified,
        this.owner,
        this.emailOnError,
        this.providerData);
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }
      const existing = WorkerPool.fromDbRows(
        await db.fns.get_worker_pool(this.workerPoolId));

      if (!this.equals(existing)) {
        // new worker pool does not match, so this is a "real" conflict
        throw err;
      }
    }
  }

  // Create a serializable representation of this worker pool suitable for response
  // from an API method.
  serializable() {
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
  }

  // Compare "important" fields to another worker pool (used to check idempotency)
  equals(other) {
    const fields = [
      'workerPoolId',
      'providerId',
      'description',
      'config',
      'owner',
      'emailOnError',
    ];
    return _.isEqual(_.pick(other, fields), _.pick(this, fields));
  }
}

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
  STOPPING: 'stopping',
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
