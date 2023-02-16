let assert = require('assert');
let _ = require('lodash');
const { paginateResults } = require('taskcluster-lib-api');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { splitTaskQueueId } = require('./utils');

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
      taskQueueId: row.task_queue_id,
      schedulerId: row.scheduler_id,
      projectId: row.project_id,
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
    return Task.fromDbRows(await db.fns.get_task_projid(taskId));
  }

  // Call db.create_task_projid with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    // for array values, we need to stringify manually because node-pg
    // otherwise does not correctly serialize the array values
    const arr = v => JSON.stringify(v);
    try {
      await db.fns.create_task_projid(
        this.taskId,
        this.taskQueueId,
        this.schedulerId,
        this.projectId,
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
    const { provisionerId, workerType } = splitTaskQueueId(this.taskQueueId);
    return {
      provisionerId: provisionerId,
      workerType: workerType,
      taskQueueId: this.taskQueueId,
      schedulerId: this.schedulerId,
      projectId: this.projectId,
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
    // Some of the elements of the `runs` object are timestamps that were created
    // by postgres, and its ISO6501 format is valid but differs from the JS .toJSON()
    // format the TC API typically returns.  Because these are stored as simple strings
    // in a JSON object in the DB, they are not automatically converted to Date objects
    // when returned from a DB query. So, we reformat those timestamps here
    // to ensure a uniform structure.
    const ts = s => s ? new Date(s).toJSON() : s;

    const { provisionerId, workerType } = splitTaskQueueId(this.taskQueueId);
    return {
      taskId: this.taskId,
      provisionerId: provisionerId,
      workerType: workerType,
      taskQueueId: this.taskQueueId,
      schedulerId: this.schedulerId,
      projectId: this.projectId,
      taskGroupId: this.taskGroupId,
      deadline: this.deadline.toJSON(),
      expires: this.expires.toJSON(),
      retriesLeft: this.retriesLeft,
      state: this.state(),
      runs: this.runs.map((run, runId) => {
        return {
          runId,
          state: run.state,
          reasonCreated: run.reasonCreated,
          reasonResolved: run.reasonResolved,
          workerGroup: run.workerGroup,
          workerId: run.workerId,
          takenUntil: ts(run.takenUntil),
          scheduled: ts(run.scheduled),
          started: ts(run.started),
          resolved: ts(run.resolved),
        };
      }),
    };
  }

  // Get state of latest run, or 'unscheduled' if no runs
  state() {
    return (_.last(this.runs) || { state: 'unscheduled' }).state;
  }

  // Update the status of this task using the value returned from one of the task-mutation
  // functions like schedule_task or cancel_task that returns (retries_left, runs,
  // taken_until).  If the mutation function's preconditions were not met (so it returned
  // an empty set), returns false; returns true on success.
  updateStatusWith(result) {
    if (result.length) {
      const row = result[0];
      this.retriesLeft = row.retries_left;
      this.runs = row.runs;
      this.takenUntil = row.taken_until;

      return true;
    }

    return false;
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

  // Create an instance from createProvisioner API request arguments
  static fromApi(provisionerId, input) {
    assert(input.expires);
    assert(input.lastDateActive);
    return new Provisioner({
      provisionerId,
      ...input,
      // convert to dates
      expires: new Date(input.expires),
      lastDateActive: new Date(input.lastDateActive),
      actions: input.actions || [],
    });
  }

  // Get a provisioner from the DB, or undefined
  // This is emulated using the task_queues table as there is no
  // longer a queue_provisioners table.
  static async get(db, provisionerId, expires) {
    const allTaskQueues = await TaskQueue.getAllTaskQueues(db, new Date());
    const taskQueuesForProvisioner = allTaskQueues.filter(
      tq => (provisionerId === splitTaskQueueId(tq.taskQueueId).provisionerId),
    );
    let provisioner;
    taskQueuesForProvisioner.forEach(tq => {
      if (!provisioner) {
        provisioner = Provisioner.fromApi(provisionerId, {
          expires: tq.expires,
          lastDateActive: tq.lastDateActive,
          description: '',
          stability: 'experimental',
        });
      } else {
        if (tq.expires > provisioner.expires) {
          provisioner.expires = tq.expires;
        }
        if (tq.lastDateActive > provisioner.lastDateActive) {
          provisioner.lastDateActive = tq.lastDateActive;
        }
      }
    });
    return provisioner;
  }

  // The response will be of the form { rows, continationToken }.
  // If there are no provisioners to show, the response will have the
  // `rows` field set to an empty array.
  // There is no longer a queue_provisioners table, so this function
  // is emulated by using the data from the task_queues table
  static async getProvisioners(
    db,
    {
      expires,
    },
    {
      query,
    } = {},
  ) {
    const allTaskQueues = await TaskQueue.getAllTaskQueues(db, new Date());
    let allProvisioners = new Map();
    allTaskQueues.forEach(tq => {
      const { provisionerId } = splitTaskQueueId(tq.taskQueueId);
      if (allProvisioners.has(provisionerId)) {
        const prov = allProvisioners.get(provisionerId);
        if (tq.expires > prov.expires) {
          prov.expires = tq.expires;
        }
        if (tq.lastDateActive > prov.lastDateActive) {
          prov.lastDateActive = tq.lastDateActive;
        }
      } else {
        allProvisioners.set(provisionerId, Provisioner.fromApi(provisionerId, {
          expires: tq.expires,
          lastDateActive: tq.lastDateActive,
          description: '',
          stability: 'experimental',
        }));
      }
    });
    allProvisioners = Array.from(allProvisioners.values());

    // Apply pagination on the filtered results
    return await paginateResults({
      query: { continuationToken: query.continuation, limit: query.limit },
      fetch: (size, offset) => allProvisioners.slice(offset, offset + size),
    });
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

class TaskQueue {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new TaskQueue({
      taskQueueId: row.task_queue_id,
      expires: row.expires,
      lastDateActive: row.last_date_active,
      description: row.description,
      stability: row.stability,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_task_queue
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return TaskQueue.fromDb(rows[0]);
    }
  }

  // Create an instance from createTaskQueue API request arguments
  static fromApi(taskQueueId, input) {
    assert(input.expires);
    assert(input.lastDateActive);
    return new TaskQueue({
      taskQueueId,
      ...input,
      // convert to dates
      expires: new Date(input.expires),
      lastDateActive: new Date(input.lastDateActive),
    });
  }

  // Get a worker type from the DB, or undefined
  static async get(db, taskQueueId, expires) {
    return TaskQueue.fromDbRows(await db.fns.get_task_queue(taskQueueId, expires));
  }

  // Call db.get_task_queues.
  // The response will be of the form { rows, continationToken }.
  // If there are no worker types to show, the response will have the
  // `rows` field set to an empty array.
  static async getTaskQueues(
    db,
    {
      taskQueueId,
      expires,
    },
    {
      query,
    } = {},
  ) {
    const fetchResults = async (query) => {
      const { continuationToken, rows } = await paginateResults({
        query,
        fetch: (size, offset) => db.fns.get_task_queues(
          taskQueueId || null,
          expires || null,
          size,
          offset,
        ),
      });
      const entries = rows.map(TaskQueue.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    return await fetchResults(query || {});
  }

  // Get a list with all the task queues in the DB, possibly filtered
  // by `expires`, without pagination.
  static async getAllTaskQueues(db, expires) {
    return (await db.fns.get_task_queues(
      null,
      expires || null,
      null,
      null,
    )).map(TaskQueue.fromDb);
  }

  // return the serialization of this task queue
  serialize() {
    return {
      taskQueueId: this.taskQueueId,
      expires: this.expires.toJSON(),
      lastDateActive: this.lastDateActive.toJSON(),
      description: this.description,
      stability: this.stability,
    };
  }

  // Compare to another task queue (used to check idempotency)
  equals(other) {
    return _.isEqual(other, this);
  }
}

// Export TaskQueue
exports.TaskQueue = TaskQueue;

class Worker {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new Worker({
      taskQueueId: row.task_queue_id || row.worker_pool_id,
      workerGroup: row.worker_group,
      workerId: row.worker_id,
      quarantineUntil: row.quarantine_until,
      expires: row.expires,
      firstClaim: row.first_claim,
      recentTasks: row.recent_tasks,
      lastDateActive: row.last_date_active,
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
    assert(input.lastDateActive);
    return new Worker({
      workerId,
      ...input,
      // convert to dates
      quarantineUntil: new Date(input.quarantineUntil),
      expires: new Date(input.expires),
      firstClaim: new Date(input.firstClaim),
      recentTasks: input.recentTasks || [],
      lastDateActive: new Date(input.lastDateActive),
    });
  }

  // Get a worker from the DB, or undefined
  static async get(db, taskQueueId, workerGroup, workerId, expires) {
    return Worker.fromDbRows(
      await db.deprecatedFns.get_queue_worker_tqid_with_last_date_active(
        taskQueueId,
        workerGroup,
        workerId,
        expires,
      ),
    );
  }

  // Call db.get_queue_workers_tqid_with_last_date_active.
  // The response will be of the form { rows, continationToken }.
  // If there are no workers to show, the response will have the
  // `rows` field set to an empty array.
  static async getWorkers(db, { taskQueueId, expires }, { query } = {}) {
    const fetchResults = async (query) => {
      const { continuationToken, rows } = await paginateResults({
        query,
        fetch: (size, offset) =>
          db.deprecatedFns.get_queue_workers_tqid_with_last_date_active(
            taskQueueId || null,
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

  // return the serialization of this worker
  serialize() {
    return {
      taskQueueId: this.taskQueueId,
      workerGroup: this.workerGroup,
      workerId: this.workerId,
      quarantineUntil: this.quarantineUntil.toJSON(),
      expires: this.expires.toJSON(),
      firstClaim: this.firstClaim.toJSON(),
      recentTasks: _.cloneDeep(this.recentTasks),
      lastDateActive: this.lastDateActive?.toJSON(),
    };
  }

  // Compare to another worker (used to check idempotency)
  equals(other) {
    return _.isEqual(other, this);
  }
}

// Export Worker
exports.Worker = Worker;

class TaskGroup {
  constructor(props) {
    Object.assign(this, props);
  }

  static fromDb(row) {
    return new TaskGroup({
      taskGroupId: row.task_group_id,
      schedulerId: row.scheduler_id,
      expires: row.expires,
      sealed: row.sealed,
    });
  }

  static fromDbRows(rows) {
    if (rows.length === 1) {
      return TaskGroup.fromDb(rows[0]);
    }
  }

  static async get(db, taskGroupId) {
    return TaskGroup.fromDbRows(
      await db.fns.get_task_group2(taskGroupId),
    );
  }

  serialize() {
    return {
      taskGroupId: this.taskGroupId,
      schedulerId: this.schedulerId,
      expires: this.expires.toJSON(),
      ...(this.sealed ? {
        sealed: this.sealed.toJSON(),
      } : {}),
    };
  }
}

exports.TaskGroup = TaskGroup;
