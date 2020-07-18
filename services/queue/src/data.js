let Entity = require('taskcluster-lib-entities');
let assert = require('assert');
let _ = require('lodash');
const {UNIQUE_VIOLATION} = require('taskcluster-lib-postgres');

const STATUS_FIELDS = ['retriesLeft', 'runs', 'takenUntil'];

class Task {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new Task({
      taskId: row.task_id,
      provisionerId: row.provisioner_id,
      workerType: row.worker_type,
      schedulerId: row.scheduler_id,
      taskGroupId: row.task_group_id,
      dependencies: row.dependencies,
      requires: row.requires,
      routes: row.routes,
      priority: row.priority,
      retries: row.retries,
      retriesLeft: row.retries_left,
      created: row.created,
      deadline: row.deadline,
      expires: row.expires,
      scopes: row.scopes,
      payload: row.payload,
      metadata: row.metadata,
      tags: row.tags,
      extra: row.extra,
      runs: row.runs,
      takenUntil: row.taken_until,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_task
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return Task.fromDb(rows[0]);
    }
  }

  // Create an instance from createTask API request arguments
  static fromApi(taskId, input) {
    return new Task({
      taskId,
      ...input,
      // convert to dates
      created: new Date(input.created),
      deadline: new Date(input.deadline),
      expires: new Date(input.expires),
      // initial value for STATUS_FIELDS
      retriesLeft: input.retries,
      runs: [],
      takenUntil: null,
    });
  }

  // Get a task from the DB, or undefined
  static async get(db, taskId) {
    return Task.fromDbRows(await db.fns.get_task(taskId));
  }

  // Call db.create_worker with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    // for array values, we need to stringify manually because node-pg
    // otherwise does not correctly serialize the array values
    const arr = v => JSON.stringify(v);
    try {
      await db.fns.create_task(
        this.taskId,
        this.provisionerId,
        this.workerType,
        this.schedulerId,
        this.taskGroupId,
        arr(this.dependencies),
        this.requires,
        arr(this.routes),
        this.priority,
        this.retries,
        this.created,
        this.deadline,
        this.expires,
        arr(this.scopes),
        this.payload,
        this.metadata,
        arr(this.tags),
        this.extra,
      );
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }

      const existing = await Task.get(db, this.taskId);
      if (!this.equals(existing)) {
        // new worker does not match, so this is a "real" conflict
        throw err;
      }
      // ..otherwise adopt the identity of the existing task
      Object.assign(this, existing);
    }
  }

  // return the definition of this task (the immutable data)
  definition() {
    return {
      provisionerId: this.provisionerId,
      workerType: this.workerType,
      schedulerId: this.schedulerId,
      taskGroupId: this.taskGroupId,
      dependencies: _.cloneDeep(this.dependencies),
      requires: this.requires,
      routes: _.cloneDeep(this.routes),
      priority: this.priority,
      retries: this.retries,
      created: this.created.toJSON(),
      deadline: this.deadline.toJSON(),
      expires: this.expires.toJSON(),
      scopes: _.cloneDeep(this.scopes),
      payload: _.cloneDeep(this.payload),
      metadata: _.cloneDeep(this.metadata),
      tags: _.cloneDeep(this.tags),
      extra: _.cloneDeep(this.extra),
    };
  }

  // Return the task status structure
  status() {
    return {
      taskId: this.taskId,
      provisionerId: this.provisionerId,
      workerType: this.workerType,
      schedulerId: this.schedulerId,
      taskGroupId: this.taskGroupId,
      deadline: this.deadline.toJSON(),
      expires: this.expires.toJSON(),
      retriesLeft: this.retriesLeft,
      state: this.state(),
      runs: this.runs.map((run, runId) => {
        return _.defaults({runId}, _.pick(run, [
          'state',
          'reasonCreated',
          'reasonResolved',
          'workerGroup',
          'workerId',
          'takenUntil',
          'scheduled',
          'started',
          'resolved',
        ]));
      }),
    };
  }

  // Get state of latest run, or 'unscheduled' if no runs
  state() {
    return (_.last(this.runs) || {state: 'unscheduled'}).state;
  }

  // Update the status of this task using the value returned from one of the task-mutation
  // functions like schedule_task or cancel_task that returns (retries_left, runs,
  // taken_until).
  updateStatusWith(result) {
    if (result.length) {
      const row = result[0];
      this.retriesLeft = row.retries_left;
      this.runs = row.runs;
      this.takenUntil = row.taken_until;
    }
  }

  // Compare "important" fields to another task (used to check idempotency)
  equals(other) {
    return _.isEqual(
      _.omit(other, STATUS_FIELDS),
      _.omit(this, STATUS_FIELDS));
  }
}

// Export Task
exports.Task = Task;

/**
 * Provisioner describes provisioners (construed broadly - a provisionerId doesn't
 * necessarily correspond to a running service).
 *
 */
let Provisioner = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('provisionerId'),
  rowKey: Entity.keys.ConstantKey('provisioner'),
  properties: {
    provisionerId: Entity.types.String,
    // the time at which this provisioner should no longer be displayed
    expires: Entity.types.Date,
  },
}).configure({
  version: 2,
  properties: {
    provisionerId: Entity.types.String,
    // the time at which this provisioner should no longer be displayed
    expires: Entity.types.Date,
    description: Entity.types.String,
    stability: Entity.types.String,
  },
  migrate(item) {
    item.description = '';
    item.stability = 'experimental';

    return item;
  },
}).configure({
  version: 3,
  properties: {
    provisionerId: Entity.types.String,
    // the time at which this provisioner should no longer be displayed
    expires: Entity.types.Date,
    lastDateActive: Entity.types.Date,
    description: Entity.types.Text,
    stability: Entity.types.String,
  },
  migrate(item) {
    item.lastDateActive = new Date(2000, 0, 1);

    return item;
  },
}).configure({
  version: 4,
  properties: {
    provisionerId: Entity.types.String,
    // the time at which this provisioner should no longer be displayed
    expires: Entity.types.Date,
    lastDateActive: Entity.types.Date,
    description: Entity.types.Text,
    stability: Entity.types.String,
    actions: Entity.types.JSON,
  },
  migrate(item) {
    item.actions = [];

    return item;
  },
});

/**
 * Expire Provisioner entries.
 *
 * Returns a promise that all expired Provisioner entries have been deleted
 */
Provisioner.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires: Entity.op.lessThan(now),
  }, {
    limit: 250, // max number of concurrent delete operations
    handler: entry => { count++; return entry.remove(true); },
  });

  return count;
};

/** Return JSON representation of provisioner meta-data */
Provisioner.prototype.json = function() {
  return {
    provisionerId: this.provisionerId,
    expires: this.expires.toJSON(),
    lastDateActive: this.lastDateActive.toJSON(),
    description: this.description,
    stability: this.stability,
    actions: this.actions,
  };
};

// Export Provisioner
exports.Provisioner = Provisioner;

/**
 * Entity for tracking worker-types.
 */
let WorkerType = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('provisionerId'),
  rowKey: Entity.keys.StringKey('workerType'),
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    // the time at which this worker-type should no longer be displayed
    expires: Entity.types.Date,
  },
}).configure({
  version: 2,
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    // the time at which this worker-type should no longer be displayed
    expires: Entity.types.Date,
    description: Entity.types.Text,
    stability: Entity.types.String,
  },
  migrate(item) {
    item.description = '';
    item.stability = 'experimental';

    return item;
  },
}).configure({
  version: 3,
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    // the time at which this worker-type should no longer be displayed
    expires: Entity.types.Date,
    lastDateActive: Entity.types.Date,
    description: Entity.types.Text,
    stability: Entity.types.String,
  },
  migrate(item) {
    item.lastDateActive = new Date(2000, 0, 1);

    return item;
  },
});

/**
 * Expire WorkerType entries.
 *
 * Returns a promise that all expired WorkerType entries have been deleted
 */
WorkerType.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires: Entity.op.lessThan(now),
  }, {
    limit: 250, // max number of concurrent delete operations
    handler: entry => { count++; return entry.remove(true); },
  });

  return count;
};

WorkerType.prototype.json = function() {
  return {
    workerType: this.workerType,
    provisionerId: this.provisionerId,
    expires: this.expires.toJSON(),
    lastDateActive: this.lastDateActive.toJSON(),
    description: this.description,
    stability: this.stability,
  };
};

// Export WorkerType
exports.WorkerType = WorkerType;

/**
 * Entity for tracking workers.
 */
let Worker = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.CompositeKey('provisionerId', 'workerType'),
  rowKey: Entity.keys.CompositeKey('workerGroup', 'workerId'),
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,
    // the time at which this worker should no longer be displayed
    expires: Entity.types.Date,
  },
}).configure({
  version: 2,
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,
    recentTasks: Entity.types.SlugIdArray,
    // the time at which this worker should no longer be displayed
    expires: Entity.types.Date,
    firstClaim: Entity.types.Date,
  },
  migrate(item) {
    item.firstClaim = new Date(2000, 0, 1);
    item.recentTasks = Entity.types.SlugIdArray.create();

    return item;
  },
}).configure({
  version: 3,
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,
    recentTasks: Entity.types.SlugIdArray,
    disabled: Entity.types.Boolean,
    // the time at which this worker should no longer be displayed
    expires: Entity.types.Date,
    firstClaim: Entity.types.Date,
  },
  migrate(item) {
    item.firstClaim = new Date(2000, 0, 1);
    item.recentTasks = Entity.types.SlugIdArray.create();
    item.disabled = false;

    return item;
  },
}).configure({
  version: 4,
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,
    /**
     * List of objects with properties:
     * - taskId
     * - runId
     * See JSON schema for documentation.
     */
    recentTasks: Entity.types.JSON,
    disabled: Entity.types.Boolean,
    // the time at which this worker should no longer be displayed
    expires: Entity.types.Date,
    firstClaim: Entity.types.Date,
  },
  migrate(item) {
    item.recentTasks = [];

    return item;
  },
}).configure({
  version: 5,
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,
    /**
     * List of objects with properties:
     * - taskId
     * - runId
     * See JSON schema for documentation.
     */
    recentTasks: Entity.types.JSON,
    quarantineUntil: Entity.types.Date,
    // the time at which this worker should no longer be displayed
    expires: Entity.types.Date,
    firstClaim: Entity.types.Date,
  },
  migrate(item) {
    item.quarantineUntil = new Date(0);

    return item;
  },
});

/**
 * Expire Worker entries.
 *
 * Returns a promise that all expired Worker entries have been deleted
 */
Worker.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires: Entity.op.lessThan(now),
    // don't expire quarantined hosts (as they might come out of quarantine..)
    quarantineUntil: Entity.op.lessThan(now),
  }, {
    limit: 250, // max number of concurrent delete operations
    handler: entry => { count++; return entry.remove(true); },
  });

  return count;
};

Worker.prototype.json = function() {
  const worker = {
    workerType: this.workerType,
    provisionerId: this.provisionerId,
    workerId: this.workerId,
    workerGroup: this.workerGroup,
    recentTasks: this.recentTasks,
    expires: this.expires.toJSON(),
    firstClaim: this.firstClaim.toJSON(),
  };
  if (this.quarantineUntil.getTime() > new Date().getTime()) {
    worker.quarantineUntil = this.quarantineUntil.toJSON();
  }
  return worker;
};

exports.Worker = Worker;
