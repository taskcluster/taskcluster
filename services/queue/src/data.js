let assert = require('assert');
let _ = require('lodash');
const { paginateResults } = require('taskcluster-lib-api');
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

class Provisioner {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new Provisioner({
      provisionerId: row.provisioner_id,
      expires: row.expires,
      lastDateActive: row.last_date_active,
      description: row.description,
      stability: row.stability,
      actions: row.actions,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_provisioner
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return Provisioner.fromDb(rows[0]);
    }
  }

  // Create an instance from createProvisioner API request arguments
  static fromApi(provisioner, input) {
    assert(input.expires);
    assert(input.lastDateActive);
    return new Provisioner({
      provisioner,
      ...input,
      // convert to dates
      expires: new Date(input.expires),
      lastDateActive: new Date(input.lastDateActive),
      actions: input.actions || [],
    });
  }

  // Get a provisioner from the DB, or undefined
  static async get(db, provisionerId, expires) {
    return Provisioner.fromDbRows(await db.fns.get_queue_provisioner(provisionerId, expires));
  }

  // Call db.get_queue_provisioners.
  // The response will be of the form { rows, continationToken }.
  // If there are no provisioners to show, the response will have the
  // `rows` field set to an empty array.
  static async getProvisioners(
    db,
    {
      expires,
    },
    {
      query,
    } = {},
  ) {
    const fetchResults = async (query) => {
      const {continuationToken, rows} = await paginateResults({
        query,
        fetch: (size, offset) => db.fns.get_queue_provisioners(
          expires,
          size,
          offset,
        ),
      });
      const entries = rows.map(Provisioner.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    return await fetchResults(query || {});
  }

  // Call db.create_provisioner with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    // for array values, we need to stringify manually because node-pg
    // otherwise does not correctly serialize the array values
    const arr = v => JSON.stringify(v);
    try {
      await db.fns.create_queue_provisioner(
        this.provisionerId,
        this.expires,
        this.lastDateActive,
        this.description,
        this.stability,
        arr(this.actions),
      );
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }

      const existing = await Provisioner.get(db, this.provisionerId, new Date());
      if (!this.equals(existing)) {
        // new provisioner does not match, so this is a "real" conflict
        throw err;
      }
      // ..otherwise adopt the identity of the existing provisioner
      Object.assign(this, existing);
    }
  }

  async update(db, {description, expires, lastDateActive, stability, actions}) {
    return await db.fns.update_queue_provisioner(
      this.provisionerId,
      expires || this.expires,
      lastDateActive || this.lastDateActive,
      description || this.description,
      stability || this.stability,
      JSON.stringify(actions) || JSON.stringify(this.actions),
    );
  }

  // return the serialization of this provisioner
  serialize() {
    return {
      provisionerId: this.provisionerId,
      expires: this.expires.toJSON(),
      lastDateActive: this.lastDateActive.toJSON(),
      description: this.description,
      stability: this.stability,
      actions: _.cloneDeep(this.actions),
    };
  }

  // Compare to another provisioner (used to check idempotency)
  equals(other) {
    return _.isEqual(other, this);
  }
}

// Export Provisioner
exports.Provisioner = Provisioner;

class WorkerType {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new WorkerType({
      provisionerId: row.provisioner_id,
      workerType: row.worker_type,
      expires: row.expires,
      lastDateActive: row.last_date_active,
      description: row.description,
      stability: row.stability,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_worker_type
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return WorkerType.fromDb(rows[0]);
    }
  }

  // Create an instance from createWorkerType API request arguments
  static fromApi(workerType, input) {
    assert(input.expires);
    assert(input.lastDateActive);
    return new WorkerType({
      workerType,
      ...input,
      // convert to dates
      expires: new Date(input.expires),
      lastDateActive: new Date(input.lastDateActive),
    });
  }

  // Get a worker type from the DB, or undefined
  static async get(db, provisionerId, workerType, expires) {
    return WorkerType.fromDbRows(await db.fns.get_queue_worker_type(provisionerId, workerType, expires));
  }

  // Call db.get_queue_worker_types.
  // The response will be of the form { rows, continationToken }.
  // If there are no worker types to show, the response will have the
  // `rows` field set to an empty array.
  static async getWorkerTypes(
    db,
    {
      provisionerId,
      workerType,
      expires,
    },
    {
      query,
    } = {},
  ) {
    const fetchResults = async (query) => {
      const {continuationToken, rows} = await paginateResults({
        query,
        fetch: (size, offset) => db.fns.get_queue_worker_types(
          provisionerId || null,
          workerType || null,
          expires || null,
          size,
          offset,
        ),
      });
      const entries = rows.map(WorkerType.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    return await fetchResults(query || {});
  }

  // Call db.create_worker_type with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    try {
      await db.fns.create_queue_worker_type(
        this.provisionerId,
        this.workerType,
        this.expires,
        this.lastDateActive,
        this.description,
        this.stability,
      );
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }

      const existing = await WorkerType.get(db, this.provisionerId, this.workerType, new Date());
      if (!this.equals(existing)) {
        // new worker type does not match, so this is a "real" conflict
        throw err;
      }
      // ..otherwise adopt the identity of the existing worker type
      Object.assign(this, existing);
    }
  }

  async update(db, {description, expires, lastDateActive, stability}) {
    return await db.fns.update_queue_worker_type(
      this.provisionerId,
      this.workerType,
      expires || this.expires,
      lastDateActive || this.lastDateActive,
      description || this.description,
      stability || this.stability,
    );
  }

  // return the serialization of this worker type
  serialize() {
    return {
      provisionerId: this.provisionerId,
      workerType: this.workerType,
      expires: this.expires.toJSON(),
      lastDateActive: this.lastDateActive.toJSON(),
      description: this.description,
      stability: this.stability,
    };
  }

  // Compare to another worker type (used to check idempotency)
  equals(other) {
    return _.isEqual(other, this);
  }
}

// Export WorkerType
exports.WorkerType = WorkerType;

class Worker {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new Worker({
      provisionerId: row.provisioner_id,
      workerType: row.worker_type,
      workerGroup: row.worker_group,
      workerId: row.worker_id,
      quarantineUntil: row.quarantine_until,
      expires: row.expires,
      firstClaim: row.first_claim,
      recentTasks: row.recent_tasks,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_worker
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return Worker.fromDb(rows[0]);
    }
  }

  // Create an instance from createWorker API request arguments
  static fromApi(workerId, input) {
    assert(input.quarantineUntil);
    assert(input.expires);
    assert(input.firstClaim);
    return new Worker({
      workerId,
      ...input,
      // convert to dates
      quarantineUntil: new Date(input.quarantineUntil),
      expires: new Date(input.expires),
      firstClaim: new Date(input.firstClaim),
      recentTasks: input.recentTasks || [],
    });
  }

  // Get a worker from the DB, or undefined
  static async get(db, provisionerId, workerType, workerGroup, workerId, expires) {
    return Worker.fromDbRows(await db.fns.get_queue_worker(provisionerId, workerType, workerGroup, workerId, expires));
  }

  // Call db.get_queue_workers.
  // The response will be of the form { rows, continationToken }.
  // If there are no workers to show, the response will have the
  // `rows` field set to an empty array.
  static async getWorkers(
    db,
    {
      provisionerId,
      workerType,
      expires,
    },
    {
      query,
    } = {},
  ) {
    const fetchResults = async (query) => {
      const {continuationToken, rows} = await paginateResults({
        query,
        fetch: (size, offset) => db.fns.get_queue_workers(
          provisionerId || null,
          workerType || null,
          expires || null,
          size,
          offset,
        ),
      });

      const entries = rows.map(Worker.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    return await fetchResults(query || {});
  }

  // Call db.create_worker with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    // for array values, we need to stringify manually because node-pg
    // otherwise does not correctly serialize the array values
    const arr = v => JSON.stringify(v);
    try {
      await db.fns.create_queue_worker(
        this.provisionerId,
        this.workerType,
        this.workerGroup,
        this.workerId,
        this.quarantineUntil,
        this.expires,
        this.firstClaim,
        arr(this.recentTasks),
      );
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }

      const existing = await Worker.get(
        db,
        this.provisionerId,
        this.workerType,
        this.workerGroup,
        this.workerId,
        new Date());
      if (!this.equals(existing)) {
        // new worker does not match, so this is a "real" conflict
        throw err;
      }
      // ..otherwise adopt the identity of the existing worker
      Object.assign(this, existing);
    }
  }

  async update(db, {quarantineUntil, expires, recentTasks}) {
    return await db.fns.update_queue_worker(
      this.provisionerId,
      this.workerType,
      this.workerGroup,
      this.workerId,
      quarantineUntil || this.quarantineUntil,
      expires || this.expires,
      JSON.stringify(recentTasks) || JSON.stringify(this.recentTasks),
    );
  }

  // return the serialization of this worker
  serialize() {
    return {
      provisionerId: this.provisionerId,
      workerType: this.workerType,
      workerGroup: this.workerGroup,
      workerId: this.workerId,
      quarantineUntil: this.quarantineUntil.toJSON(),
      expires: this.expires.toJSON(),
      firstClaim: this.firstClaim.toJSON(),
      recentTasks: _.cloneDeep(this.recentTasks),
    };
  }

  // Compare to another worker (used to check idempotency)
  equals(other) {
    return _.isEqual(other, this);
  }
}

// Export Worker
exports.Worker = Worker;
