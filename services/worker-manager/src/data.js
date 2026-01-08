import _ from 'lodash';
import { UNIQUE_VIOLATION } from '@taskcluster/lib-postgres';
import taskcluster from '@taskcluster/client';
import { MAX_MODIFY_ATTEMPTS } from './util.js';
import { paginateResults } from '@taskcluster/lib-api';

/** @typedef {import('@taskcluster/lib-postgres').Database} Database */

/**
 * Create error
 * @param {string} message
 * @param {string} code
 * @param {number} statusCode
 * @returns {Error}
 */
const makeError = (message, code, statusCode) => {
  const err = new Error(message);
  err.code = code;
  err.name = `${code}Error`;
  err.statusCode = statusCode;
  return err;
};

const make404 = () => makeError('Resource not found', 'ResourceNotFound', 404);

export class WorkerPool {
  /** @type {string} */
  workerPoolId;
  /** @type {string} */
  providerId;
  /** @type {string[]} */
  previousProviderIds;
  /** @type {string} */
  description;
  /** @type {Date} */
  created;
  /** @type {Date} */
  lastModified;
  /** @type {import('../@types/index.d.ts').WorkerPoolConfig } */
  config;
  /** @type {string} */
  owner;
  /** @type {Boolean} */
  emailOnError;
  /** @type {Record<string, any>} */
  providerData;

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
      currentCapacity: row.current_capacity,
      requestedCount: row.requested_count,
      runningCount: row.running_count,
      stoppingCount: row.stopping_count,
      stoppedCount: row.stopped_count,
      requestedCapacity: row.requested_capacity,
      runningCapacity: row.running_capacity,
      stoppingCapacity: row.stopping_capacity,
      stoppedCapacity: row.stopped_capacity,
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
      currentCapacity: 0,
      requestedCount: 0,
      runningCount: 0,
      stoppingCount: 0,
      stoppedCount: 0,
      requestedCapacity: 0,
      runningCapacity: 0,
      stoppingCapacity: 0,
      stoppedCapacity: 0,
      ...input,
    });
  }

  /**
   * Get a worker pool from the DB, or undefined if it does not exist.
   * @param {Database} db
   * @param {string} workerPoolId
   * @returns {Promise<WorkerPool|undefined>}
   */
  static async get(db, workerPoolId) {
    const [rows, stats] = await Promise.all([
      db.fns.get_worker_pool_with_launch_configs(workerPoolId),
      db.fns.get_worker_pool_counts_and_capacity(workerPoolId),
    ]);

    if (rows.length === 1) {
      return WorkerPool.fromDb({
        ...rows[0],
        ...stats[0],
      });
    }
  }

  /**
   * Expire worker pools with null-provider that no longer have any workers,
   * returning the list of worker pools expired.
   *
   * @param {{ db: Database }} options
   */
  static async expire({ db }) {
    const rows = await db.fns.expire_worker_pools();
    return rows.map(row => row.worker_pool_id);
  }

  /**
   * Call db.create_worker_pool with the content of this instance. This
   * implements the usual idempotency checks and returns an error with code
   * UNIQUE_VIOLATION when those checks fail.
   *
   * @param {Database} db
   */
  async create(db) {
    try {
      return await db.fns.create_worker_pool_with_launch_configs(
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
        await db.fns.get_worker_pool_with_launch_configs(this.workerPoolId));

      if (!this.equals(existing)) {
        // new worker pool does not match, so this is a "real" conflict
        throw err;
      }
    }
    return [];
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
      currentCapacity: this.currentCapacity ?? 0,
      requestedCount: this.requestedCount ?? 0,
      runningCount: this.runningCount ?? 0,
      stoppingCount: this.stoppingCount ?? 0,
      stoppedCount: this.stoppedCount ?? 0,
      requestedCapacity: this.requestedCapacity ?? 0,
      runningCapacity: this.runningCapacity ?? 0,
      stoppingCapacity: this.stoppingCapacity ?? 0,
      stoppedCapacity: this.stoppedCapacity ?? 0,
    };
  }

  /**
   * Compare "important" fields to another worker pool (used to check idempotency)
   *
   * @param {WorkerPool} other
   */
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

/**
 * Stats collected for provisioning
 */
export class WorkerPoolStats {
  /**
   * @param {string} workerPoolId
   * @param {Record<string, number>} stats
   */
  constructor(workerPoolId, stats = {}) {
    this.workerPoolId = workerPoolId;
    /** @type {Set<string>} */
    this.providers = new Set([]);
    this.existingCapacity = stats.currentCapacity ?? 0;
    this.requestedCapacity = stats.requestedCapacity ?? 0;
    this.stoppingCapacity = stats.stoppingCapacity ?? 0;
    this.stoppedCapacity = stats.stoppedCapacity ?? 0;
    this.runningCapacity = stats.runningCapacity ?? 0;
    this.requestedCount = stats.requestedCount ?? 0;
    this.runningCount = stats.runningCount ?? 0;
    this.stoppingCount = stats.stoppingCount ?? 0;
    this.stoppedCount = stats.stoppedCount ?? 0;
    this.quarantinedCapacity = stats.quarantinedCapacity ?? 0;

    this.totalErrors = 0;
    this.capacityByLaunchConfig = new Map();
    this.errorsByLaunchConfig = new Map();
  }

  forProvision() {
    return {
      existingCapacity: this.existingCapacity,
      requestedCapacity: this.requestedCapacity,
      stoppingCapacity: this.stoppingCapacity, // Deprecated: no longer used in capacity estimation
    };
  }

  /** @param {Record<string, any>} row */
  static fromDb(row) {
    return new WorkerPoolStats(row.worker_pool_id, {
      currentCapacity: row.current_capacity,
      requestedCount: row.requested_count,
      runningCount: row.running_count,
      stoppingCount: row.stopping_count,
      stoppedCount: row.stopped_count,
      requestedCapacity: row.requested_capacity,
      runningCapacity: row.running_capacity,
      stoppingCapacity: row.stopping_capacity,
      stoppedCapacity: row.stopped_capacity,
    });
  }

  serializable() {
    return {
      workerPoolId: this.workerPoolId,
      currentCapacity: this.existingCapacity ?? 0,
      requestedCount: this.requestedCount ?? 0,
      runningCount: this.runningCount ?? 0,
      stoppingCount: this.stoppingCount ?? 0,
      stoppedCount: this.stoppedCount ?? 0,
      requestedCapacity: this.requestedCapacity ?? 0,
      runningCapacity: this.runningCapacity ?? 0,
      stoppingCapacity: this.stoppingCapacity ?? 0,
      stoppedCapacity: this.stoppedCapacity ?? 0,
    };
  }

  /** @param {Worker} worker */
  updateFromWorker(worker) {
    const isStopping = worker.state === Worker.states.STOPPING;
    const isRequested = worker.state === Worker.states.REQUESTED;
    const isQuarantined = worker.quarantineUntil && worker.quarantineUntil > new Date();

    if (isStopping) {
      this.stoppingCapacity += worker.capacity;
    } else {
      const requestedCapacity = isRequested ? worker.capacity : 0;
      const existingCapacity = isQuarantined ? 0 : worker.capacity;

      if (isQuarantined) {
        this.quarantinedCapacity += existingCapacity;
      }

      this.existingCapacity += existingCapacity;
      this.requestedCapacity += requestedCapacity;
    }

    if (worker.launchConfigId) {
      this.capacityByLaunchConfig.set(
        worker.launchConfigId,
        this.capacityByLaunchConfig.get(worker.launchConfigId) + worker.capacity || worker.capacity,
      );
    }
  }
}

/** @typedef {import('../@types/index.d.ts').CloudLaunchConfig} CloudLaunchConfig */
export class WorkerPoolLaunchConfig {
  /** @type {string} */
  launchConfigId;
  /** @type {string} */
  workerPoolId;
  /** @type {Boolean} */
  isArchived;
  /** @type {CloudLaunchConfig} */
  configuration;
  /** @type {Date} */
  created;
  /** @type {Date} */
  lastModified;

  constructor(props) {
    Object.assign(this, props);
  }

  get initialWeight() {
    return this.configuration?.workerManager?.initialWeight ?? 1;
  }

  static fromDb(row) {
    return new WorkerPoolLaunchConfig({
      launchConfigId: row.launch_config_id,
      workerPoolId: row.worker_pool_id,
      isArchived: row.is_archived,
      configuration: row.configuration,
      created: row.created,
      lastModified: row.last_modified,
    });
  }

  /**
   * @param {Database} db
   * @param {string} workerPoolId
   * @returns {Promise<WorkerPoolLaunchConfig[]>}
   */
  static async load(db, workerPoolId) {
    const isArchived = false;
    const rows = await db.fns.get_worker_pool_launch_configs(workerPoolId, isArchived, null, null);
    return rows.map(WorkerPoolLaunchConfig.fromDb);
  }

  // remove launch configurations that no longer have workers associated with them
  static async expire({ db, monitor }) {
    const rows = await db.fns.expire_worker_pool_launch_configs();
    return rows.map(row => row.launch_config_id);
  }
}

export class WorkerPoolError {
  /** @type {string} */
  errorId;
  /** @type {string} */
  workerPoolId;
  /** @type {Date} */
  reported;
  /** @type {string} */
  kind;
  /** @type {string} */
  title;
  /** @type {string} */
  description;
  /** @type {Object} */
  extra;
  /** @type {string?} */
  launchConfigId;

  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new WorkerPoolError({
      errorId: row.error_id,
      workerPoolId: row.worker_pool_id,
      reported: row.reported,
      kind: row.kind,
      title: row.title,
      description: row.description,
      extra: row.extra,
      launchConfigId: row.launch_config_id,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_worker_pool_error.
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return WorkerPoolError.fromDb(rows[0]);
    }
  }

  // Create an instance from API arguments, with default values applied.
  static fromApi(input) {
    const now = new Date();
    return new WorkerPoolError({
      extra: {},
      reported: now,
      ...input,
    });
  }

  // Get a worker pool error from the DB, or undefined if it does not exist.
  static async get(db, errorId, workerPoolId) {
    return WorkerPoolError.fromDbRows(await db.fns.get_worker_pool_error_launch_config(errorId, workerPoolId));
  }

  // Expire worker pool errors reported before the specified time
  static async expire({ db, retentionDays }) {
    const cutOffTime = taskcluster.fromNow(`-${retentionDays || 1} days`);
    return (await (db.fns.expire_worker_pool_errors(cutOffTime)))[0].expire_worker_pool_errors;
  }

  // Call db.create_worker_pool_error with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    try {
      await db.fns.create_worker_pool_error_launch_config(
        this.errorId,
        this.workerPoolId,
        this.reported,
        this.kind,
        this.title,
        this.description,
        this.extra,
        this.launchConfigId);
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }
      const existing = WorkerPoolError.fromDbRows(
        await db.fns.get_worker_pool_error_launch_config(this.errorId, this.workerPoolId));

      if (!this.equals(existing)) {
        // new worker pool error does not match, so this is a "real" conflict
        throw err;
      }
    }
  }

  // Create a serializable representation of this worker pool error suitable for response
  // from an API method.
  serializable() {
    return {
      errorId: this.errorId,
      workerPoolId: this.workerPoolId,
      reported: this.reported.toJSON(),
      kind: this.kind,
      title: this.title,
      description: this.description,
      extra: this.extra,
      launchConfigId: this.launchConfigId || undefined,
    };
  }

  // Compare "important" fields to another worker pool error (used to check idempotency)
  equals(other) {
    const fields = [
      'errorId',
      'workerPoolId',
      'kind',
      'title',
      'description',
      'launchConfigId',
    ];
    return _.isEqual(_.pick(other, fields), _.pick(this, fields));
  }
}

export class Worker {
  /** @type {string} */
  workerPoolId;
  /** @type {string} */
  workerGroup;
  /** @type {string} */
  workerId;
  /** @type {string} */
  providerId;
  /** @type {Date} */
  created;
  /** @type {Date} */
  expires;
  /** @type {string} */
  state;
  /** @type {Object} */
  providerData;
  /** @type {number} */
  capacity;
  /** @type {Date} */
  lastModified;
  /** @type {Date} */
  lastChecked;
  /** @type {string} */
  etag;
  /** @type {string} */
  secret;
  /** @type {Date} */
  quarantineUntil;
  /** @type {Array} */
  quarantineDetails;
  /** @type {Date} */
  firstClaim;
  /** @type {Array} */
  recentTasks;
  /** @type {Date} */
  lastDateActive;
  /** @type {string|null} */
  launchConfigId;

  // (private constructor)
  constructor(props) {
    Object.assign(this, props);

    this._properties = props;
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new Worker({
      workerPoolId: row.worker_pool_id,
      workerGroup: row.worker_group,
      workerId: row.worker_id,
      providerId: row.provider_id,
      created: row.created,
      expires: row.expires,
      state: row.state,
      providerData: row.provider_data,
      capacity: row.capacity,
      lastModified: row.last_modified,
      lastChecked: row.last_checked,
      etag: row.etag,
      secret: row.secret,
      quarantineUntil: row.quarantine_until,
      quarantineDetails: row.quarantine_details || [],
      firstClaim: row.first_claim,
      recentTasks: row.recent_tasks,
      lastDateActive: row.last_date_active,
      launchConfigId: row.launch_config_id || undefined,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_worker_pool.
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return Worker.fromDb(rows[0]);
    }
  }

  // Create an instance from API arguments, with default values applied.
  static fromApi(input) {
    const now = new Date();
    return new Worker({
      state: Worker.states.REQUESTED,
      providerData: {},
      created: now,
      lastModified: now,
      lastChecked: now,
      secret: null,
      expires: taskcluster.fromNow('1 week'),
      quarantineUntil: null,
      launchConfigId: null,
      ...input,
    });
  }

  // Get a worker from the DB, or undefined if it does not exist.
  static async get(db, { workerPoolId, workerGroup, workerId }) {
    return Worker.fromDbRows(await db.fns.get_worker_3(workerPoolId, workerGroup, workerId));
  }

  // Get a queue worker from the DB, or undefined if it does not exist.
  static async getQueueWorker(db, workerPoolId, workerGroup, workerId, expires) {
    return Worker.fromDbRows(
      await db.fns.get_queue_worker_with_wm_data(
        workerPoolId,
        workerGroup,
        workerId,
        expires,
      ),
    );
  }

  /**
   * db.get_queue_workers_with_wm_join.
   * The response will be of the form { rows, continationToken }.
   * If there are no workers to show, the response will have the
   * `rows` field set to an empty array.
   *
   * @param {Database} db
   * @param {{workerPoolId?: string, expires?: Date}} params - Parameters object
   * @param {{ workerState?: string, launchConfigId?: string, quarantined?: string }} [queryIn]
   * @returns {Promise<{rows: Worker[], continuationToken: string}>}
   */
  static async getWorkers(db, { workerPoolId, expires }, queryIn = {}) {
    const fetchResults = async (query) => {
      const { continuationToken, rows } = await paginateResults({
        query,
        fetch: (size, offset) => {
          return db.fns.get_queue_workers_with_wm_data(
            workerPoolId || null,
            expires || null,
            query.workerState && Object.values(Worker.states).includes(query.workerState) ? query.workerState : null,
            query.quarantined === 'true', // only_quarantined_in
            query.launchConfigId ?? null,
            size,
            offset,
          );
        },
      });

      const entries = rows.map(Worker.fromDb);

      return { rows: entries, continuationToken };
    };

    // Fetch results
    return fetchResults(queryIn || {});
  }

  // Expire workers,
  // returning the count of workers expired.
  static async expire({ db, monitor }) {
    return (await db.fns.expire_workers(new Date()))[0].expire_workers;
  }

  // Call db.create_worker with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    try {
      const etag = (await db.fns.create_worker_with_lc(
        this.workerPoolId,
        this.workerGroup,
        this.workerId,
        this.providerId,
        this.created,
        this.expires,
        this.state,
        this.providerData,
        this.capacity,
        this.lastModified,
        this.lastChecked,
        this.launchConfigId,
      ))[0].create_worker_with_lc;

      return new Worker({
        workerPoolId: this.workerPoolId,
        workerGroup: this.workerGroup,
        workerId: this.workerId,
        providerId: this.providerId,
        created: this.created,
        expires: this.expires,
        state: this.state,
        providerData: this.providerData,
        capacity: this.capacity,
        lastModified: this.lastModified,
        lastChecked: this.lastChecked,
        etag,
        secret: this.secret,
        quarantineUntil: null,
        launchConfigId: this.launchConfigId,
      });
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }
      const existing = await Worker.get(db, {
        workerPoolId: this.workerPoolId,
        workerGroup: this.workerGroup,
        workerId: this.workerId,
      });

      if (!this.equals(existing)) {
        // new worker does not match, so this is a "real" conflict
        throw err;
      }

      return existing;
    }
  }

  // Create a serializable representation of this worker suitable for response
  // from an API method.
  serializable({ removeQueueData = false, removeWorkerManagerData = false } = {}) {
    const worker = {
      workerPoolId: this.workerPoolId,
      workerGroup: this.workerGroup,
      workerId: this.workerId,
      providerId: this.providerId || 'none',
      created: this.created?.toJSON(),
      expires: this.expires?.toJSON(),
      state: this.state || 'standalone',
      capacity: this.capacity || 0,
      launchConfigId: this.launchConfigId || undefined,
      lastModified: this.lastModified?.toJSON(),
      lastChecked: this.lastChecked?.toJSON(),
      firstClaim: this.firstClaim?.toJSON(),
      recentTasks: _.cloneDeep(this.recentTasks) || [],
      lastDateActive: this.lastDateActive?.toJSON(),
      quarantineUntil: this.quarantineUntil?.toJSON(),
      quarantineDetails: this.quarantineDetails || [],
    };

    // Remove properties that should not be in this response schema.
    // These properties are used in the `worker-response.yml` schema
    // which is used in the `getWorker` API.
    if (removeQueueData) {
      delete worker.firstClaim;
      delete worker.recentTasks;
      delete worker.lastDateActive;
      delete worker.quarantineUntil;
      delete worker.quarantineDetails;
    }

    // Remove properties that should not be in this response schema.
    // These properties are used in the `worker-full.yml` schema
    // which is used in the `worker`, `createWorker`, and `updateWorker`
    // APIs.
    if (removeWorkerManagerData) {
      delete worker.created;
      delete worker.lastModified;
      delete worker.lastChecked;
    }

    return worker;
  }

  /**
   * Calls db.update_worker given a modifier.
   * This function shouldn't have side-effects (or these should be contained),
   * as the modifier may be called more than once, if the update operation fails.
   * This method will apply modifier to a clone of the current data and attempt
   * to save it. But if this fails because the entity have been updated by
   * another process (the etag is out of date), it'll reload the row
   * from the workers table, invoke the modifier again, and try to save again.
   *
   * Returns the updated Worker instance if successful. Otherwise, it will return
   * * a 404 if it fails to locate the row to update
   * * a 409 if the number of retries reaches MAX_MODIFY_ATTEMPTS
   *
   * Note: modifier is allowed to return a promise.
   *
   * @param {Database} db
   * @param {(w: Worker) => void} modifier
   */
  async update(db, modifier) {
    let attemptsLeft = MAX_MODIFY_ATTEMPTS;

    const attemptModify = async () => {
      const newProperties = _.cloneDeep(this._properties);
      let result;
      await modifier.call(newProperties, newProperties);

      if (!_.isEqual(newProperties, this._properties)) {
        try {
          [result] = await db.fns.update_worker_3(
            newProperties.workerPoolId,
            newProperties.workerGroup,
            newProperties.workerId,
            newProperties.providerId,
            newProperties.created,
            newProperties.expires,
            newProperties.state,
            newProperties.providerData,
            newProperties.capacity,
            newProperties.lastModified,
            newProperties.lastChecked,
            newProperties.etag,
            newProperties.secret,
          );

          const worker = Worker.fromDb(result);
          this.updateInstanceFields(worker);
        } catch (e) {
          if (e.code === 'P0004') {
            return null;
          }

          if (e.code === 'P0002') {
            throw make404();
          }

          throw e;
        }
      }

      return this;
    };

    let result;
    while (attemptsLeft--) {
      result = await attemptModify();

      if (result) {
        break;
      }

      await this.reload(db);
    }

    if (attemptsLeft <= 0) {
      throw makeError('MAX_MODIFY_ATTEMPTS exhausted, check for congestion', 'EntityWriteCongestionError', 409);
    }

    return result;
  }

  updateInstanceFields(worker) {
    Object.keys(worker).forEach(prop => {
      this[prop] = worker[prop];
    });

    this._properties = worker;
  }

  // Load the properties from the table once more, and update the instance fields.
  async reload(db) {
    const worker = await Worker.get(db, {
      workerPoolId: this.workerPoolId,
      workerGroup: this.workerGroup,
      workerId: this.workerId,
    });

    this.updateInstanceFields(worker);
  }

  // Compare "important" fields to another worker (used to check idempotency)
  equals(other) {
    const fields = [
      'workerPoolId',
      'workerGroup',
      'workerId',
      'providerId',
      'state',
      'capacity',
    ];
    return _.isEqual(_.pick(other, fields), _.pick(this, fields));
  }
}

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
