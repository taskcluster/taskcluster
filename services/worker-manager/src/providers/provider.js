import assert from 'assert';
import crypto from 'crypto';
import _ from 'lodash';
import libUrls from 'taskcluster-lib-urls';
import slugid from 'slugid';
import yaml from 'js-yaml';
import { Worker, WorkerPoolError } from '../data.js';

/** @typedef {import('../data.js').WorkerPool} WorkerPool */
/** @typedef {import('../data.js').WorkerPoolStats} WorkerPoolStats */

/** @typedef {{
*   monitor: object,
*   notify: object,
*   rootUrl: string,
*   providerId: string,
*   providerType: string,
*   db: import('@taskcluster/lib-postgres').Database,
*   estimator: import('../estimator.js').Estimator,
*   Worker: import('../data.js').Worker,
*   WorkerPoolError: import('../data.js').WorkerPoolError,
*   validator: Function,
*   publisher: import('@taskcluster/lib-pulse').PulsePublisher,
*   launchConfigSelector: import('../launch-config-selector.js').LaunchConfigSelector
* }} ProviderConfigOptions */

/**
 * The parent class for all providers.
 *
 * See ../../providers.md for information on writing providers.
 */
export class Provider {
  setupFailed = false;

  /**
   * @param {ProviderConfigOptions} opts
   */
  constructor({
    providerId,
    notify,
    db,
    monitor,
    rootUrl,
    estimator,
    validator,
    providerType,
    publisher,
    launchConfigSelector,
  }) {
    assert(db, 'db is required');
    assert(estimator, 'estimator is required');
    assert(monitor, 'monitor is required');
    assert(notify, 'notify is required');
    assert(validator, 'validator is required');
    assert(publisher, 'publisher is required');
    assert(launchConfigSelector, 'launchConfigSelector is required');

    this.providerId = providerId;
    this.monitor = monitor;
    this.validator = validator;
    this.notify = notify;
    this.db = db;
    this.rootUrl = rootUrl;
    this.estimator = estimator;
    this.Worker = Worker;
    this.WorkerPoolError = WorkerPoolError;
    this.providerType = providerType;
    this.publisher = publisher;
    this.launchConfigSelector = launchConfigSelector;

    /** @type {string[]} */
    this.emailCache = [];
  }

  async setup() {
  }

  async initiate() {
  }

  async terminate() {
  }

  validate(config) {
    assert(this.configSchema); // This must be set up by a provider impl
    return this.validator(config, libUrls.schema(this.rootUrl, 'worker-manager', `v1/${this.configSchema}.yml`));
  }

  async prepare() {
  }

  /**
   * @param {{ workerPool: WorkerPool, workerPoolStats: WorkerPoolStats }} opts
   */
  async provision({ workerPool, workerPoolStats }) {
  }

  /**
   * @param {{ workerPool: WorkerPool }} opts
   */
  async deprovision({ workerPool }) {
  }

  /**
   * @param {{ workerPool: WorkerPool, worker: Worker, workerIdentityProof: Record<string, any> }} opts
   */
  async registerWorker({ worker, workerPool, workerIdentityProof }) {
    throw new ApiError('not supported for this provider');
  }

  async cleanup() {
  }

  async scanPrepare() {
  }

  /**
   * @param {{ worker: Worker }} opts
   */
  async checkWorker({ worker }) {
  }

  async scanCleanup() {
  }

  /**
   * Get active launch configs to spawn workers
   * This is using launch config selector that loads all active launch configs for a given worker pool
   * and then uses a weighted random config helper to select launch random configs
   * with probabilities adjusted with `initialWeight` and WorkerPoolStats that were collected at
   * provisioning time, which includes total number of workers and their states, and the errors
   *
   * Some providers like AWS uses different approach to provision, as it can launch multiple instances
   * of the same kind at once, so we return all launch configs and let it select the options.
   *
   * Launch configs with weight = 0 would not be selected
   *
   * @param {Object} options
   * @param {WorkerPool} options.workerPool - worker pool
   * @param {Number} options.toSpawn - number of workers to spawn
   * @param {WorkerPoolStats} options.workerPoolStats - provisioning stats
   * @param {Boolean} [options.returnAll] - return all launch configs
   */
  async selectLaunchConfigsForSpawn({ workerPool, toSpawn, workerPoolStats, returnAll = false }) {
    assert(toSpawn >= 0, 'toSpawn capacity must be a positive number');

    const configSelector = await this.launchConfigSelector.forWorkerPool(workerPool, workerPoolStats);

    if (returnAll) {
      return configSelector.getAll();
    }

    return configSelector.selectCapacity(toSpawn);
  }

  /**
   * @param {{ workerPool: WorkerPool, workerId: string, workerGroup: string, input: object }} opts
   */
  async createWorker({ workerPool, workerGroup, workerId, input }) {
    throw new ApiError('not supported for this provider');
  }

  /**
   * @param {{ workerPool: WorkerPool, worker: Worker, input: object }} opts
   */
  async updateWorker({ workerPool, worker, input }) {
    throw new ApiError('not supported for this provider');
  }

  /**
   * @param {{ worker: Worker, reason: string }} opts
   */
  async removeWorker({ worker, reason }) {
    throw new ApiError('not supported for this provider');
  }

  /**
   * @param {Object} options
   * @param {import('../data.js').Worker} options.worker
   * @param {Number|Date} options.terminateAfter
   */
  async onWorkerRequested({ worker, terminateAfter }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerRequested',
      extraLog: { terminateAfter },
    });
  }

  /**
   * @param {Object} options
   * @param {import('../data.js').Worker} options.worker
   */
  async onWorkerRunning({ worker }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerRunning',
    });
  }

  /**
   * @param {Object} options
   * @param {import('../data.js').Worker} options.worker
   */
  async onWorkerStopped({ worker }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerStopped',
    });
  }

  /**
   * @param {Object} options
   * @param {import('../data.js').Worker} options.worker
   * @param {String} options.reason
   */
  async onWorkerRemoved({ worker, reason = 'unknown' }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerRemoved',
      extraLog: { reason },
      extraPublish: { reason },
    });
  }

  /**
   * @param {Object} options
   * @param {import('../data.js').Worker} options.worker
   * @param {String} options.event
   * @param {Object} [options.extraLog]
   * @param {Object} [options.extraPublish]
   */
  async _onWorkerEvent({ worker, event, extraLog = {}, extraPublish = {} }) {
    assert(['workerRequested', 'workerRunning', 'workerStopped', 'workerRemoved'].includes(event), 'unknown event');
    this.monitor.log[event]({
      workerPoolId: worker.workerPoolId,
      providerId: this.providerId,
      workerId: worker.workerId,
      workerGroup: worker.workerGroup,
      launchConfigId: worker.launchConfigId,
      ...extraLog,
    });

    await this.publisher[event]({
      workerPoolId: worker.workerPoolId,
      providerId: this.providerId,
      workerId: worker.workerId,
      workerGroup: worker.workerGroup,
      capacity: worker.capacity,
      timestamp: new Date().toJSON(),
      launchConfigId: worker.launchConfigId,
      ...extraPublish,
    });

    await this._recordWorkerMetrics({ worker, event });
  }

  /**
   * Tracking how many seconds it took for worker to become alive (register)
   * and total duration of it running
   *
   * @param {Object} options
   * @param {import('../data.js').Worker} options.worker
   * @param {String} options.event
   */
  async _recordWorkerMetrics({ worker, event }) {
    if (event === 'workerRunning') {
      await this._recordWorkerRegistrationDuration(worker);
    } else if (event === 'workerRemoved' || event === 'workerStopped') {
      await this._recordWorkerStopped(worker);
    }
  }

  /** @param {import('../data.js').Worker} worker */
  async _recordWorkerRegistrationDuration(worker) {
    const lifecycle = Provider.getWorkerManagerData(worker);
    if (lifecycle?.registeredAt) {
      return; // already recorded
    }

    const created = worker.created?.getTime?.();
    if (!Number.isFinite(created)) {
      return;
    }

    const now = Date.now();
    const durationSeconds = (now - created) / 1000;
    if (durationSeconds >= 0) {
      this.monitor.metric.workerRegistrationDuration(durationSeconds, {
        workerPoolId: worker.workerPoolId,
        providerId: this.providerId,
      });
    }

    await worker.update(this.db, worker => {
      const lifecycleData = Provider.ensureWorkerManagerData(worker);
      if (!lifecycleData.registeredAt) {
        lifecycleData.registeredAt = new Date(now).toJSON();
      }
    });
  }

  /**
   * Track worker lifetime
   *
   * @param {import('../data.js').Worker} worker
   **/
  async _recordWorkerStopped(worker) {
    const lifecycle = Provider.getWorkerManagerData(worker);
    if (lifecycle?.stoppedAt) {
      return; // already recorded
    }

    const now = Date.now();
    const registeredAt = Provider.timestampToMs(lifecycle?.registeredAt);
    const currentState = worker.state; // Capture state before it changes

    await worker.update(this.db, worker => {
      const lifecycleData = Provider.ensureWorkerManagerData(worker);
      if (!lifecycleData.stoppedAt) {
        lifecycleData.stoppedAt = new Date(now).toJSON();
        lifecycleData.previousState = currentState;
      }
    });

    if (Number.isFinite(registeredAt)) {
      const durationSeconds = (now - registeredAt) / 1000;
      if (durationSeconds >= 0) {
        this.monitor.metric.workerLifetime(durationSeconds, {
          workerPoolId: worker.workerPoolId,
          providerId: this.providerId,
        });
      }
    } else if (currentState === Worker.states.REQUESTED) {
      // Worker never made it to RUNNING state = registration failure
      this.monitor.metric.workerRegistrationFailure(1, {
        workerPoolId: worker.workerPoolId,
        providerId: this.providerId,
      });
    }
  }

  /**
   * Spawned workers are expected to:
   * 1. Start (instance is running)
   * 2. Register (worker is registered with worker manager)
   * 3. Do work (call queue.claimWork/queue.reclaimTask)
   *
   * If worker does not register within given timeout, it will be removed after `terminateAfter` time.
   * If worker fails to call queue.claimWork, `queue_worker.first_claim` would be set to null.
   * If worker does not call queue.reclaimTask or stops calling queue.claimWork,
   * `queue_worker.last_date_active` would not be updated.
   *
   * Workers that are registered, but don't have `first_claim`
   * or `last_date_active` is older than queueInactivityTimeout are considered to be zombies.
   *
   * Both `firstClaim` and `lastDateActive` are coming from queue service.
   * Those get updated when worker calls queue methods.
   *
   * @param {{ worker: import('../data.js').Worker }} options
   */
  static isZombie({ worker }) {
    const queueInactivityTimeout = worker.providerData?.queueInactivityTimeout || 7200 * 1000;

    const lastActiveAfter = Date.now() - queueInactivityTimeout;
    const isOlderThanTimeout = (date) => date?.getTime() < lastActiveAfter;

    // undefined means fields are missing (not fetched from db), null means legitimately empty
    if (worker.firstClaim === undefined || worker.lastDateActive === undefined) {
      return { reason: 'queue fields not fetched from database', isZombie: false };
    }

    if (worker.firstClaim === null && isOlderThanTimeout(worker.created)) {
      return {
        isZombie: true,
        reason: `worker never claimed work, created=${worker.created}, queueInactivityTimeout=${queueInactivityTimeout / 1000}s`,
      };
    }

    if (worker.lastDateActive !== null && isOlderThanTimeout(worker.lastDateActive)) {
      return {
        isZombie: true,
        reason: `worker inactive, lastDateActive=${worker.lastDateActive}, queueInactivityTimeout=${queueInactivityTimeout / 1000}s`,
      };
    }

    return { isZombie: false, reason: 'Not enough data' };
  }

  /**
   * Takes a lifecycle block as defined in the schema and returns
   * a date when the worker should be destroyed if the provider
   * supports this action. Also returns the reregistrationTimeout
   * in milliseconds (as opposed to the seconds it is defined in) for
   * doing date math with easier.
   * This defaults reregistrationTimeout to 4 days. Note that
   * this is also set in the lifecycle schema so update there if
   * changing.
   */
  static interpretLifecycle({ lifecycle: {
    registrationTimeout, reregistrationTimeout, queueInactivityTimeout,
  } = {} }) {
    reregistrationTimeout = reregistrationTimeout || 345600;
    queueInactivityTimeout = queueInactivityTimeout || 7200; // 2 hours by default
    let terminateAfter = null;

    if (registrationTimeout !== undefined && registrationTimeout < reregistrationTimeout) {
      terminateAfter = Date.now() + registrationTimeout * 1000;
    } else {
      terminateAfter = Date.now() + reregistrationTimeout * 1000;
    }

    return {
      terminateAfter,
      reregistrationTimeout: reregistrationTimeout * 1000,
      queueInactivityTimeout: queueInactivityTimeout * 1000,
    };
  }

  /**
   * Report an error concerning this worker pool.  This handles notifications and logging.
   *
   * @param {Object} options
   * @param {import('../data.js').WorkerPool} options.workerPool
   * @param {String} options.kind
   * @param {String} options.title
   * @param {String} options.description
   * @param {{ workerId?:string, workerGroup?:string } & Record<string, any>} options.extra - extra info about the error
   * @param {String|null} options.launchConfigId
   * @returns {Promise<import('../data.js').WorkerPoolError>}
   */
  async reportError({ workerPool, kind, title, description, extra = {}, launchConfigId }) {
    const errorId = slugid.v4();
    let error = this.WorkerPoolError.fromApi({
      workerPoolId: workerPool.workerPoolId,
      errorId,
      reported: new Date(),
      kind,
      title,
      description,
      extra,
      launchConfigId,
    });

    try {
      if (workerPool.emailOnError) {
        if (!this.isDuplicate(extra, description, workerPool.workerPoolId)) {
          await this.notify.email({
            address: workerPool.owner,
            subject: `Taskcluster Worker Manager Error: ${title}`,
            content: getExtraInfo({ extra, description, workerPoolId: workerPool.workerPoolId, errorId }),
          });
          this.markSent(extra, description, workerPool.workerPoolId);
        } else {
          this.monitor.debug('Duplicate error email detected. Not attempting resend.');
        }
      }

      await this.monitor.log.workerError({
        workerPoolId: workerPool.workerPoolId,
        errorId,
        reported: new Date(),
        kind,
        title,
        description,
      });

      await this.publisher.workerPoolError({
        workerPoolId: workerPool.workerPoolId,
        providerId: workerPool.providerId,
        errorId,
        kind,
        title,
        timestamp: new Date().toJSON(),
        workerId: extra?.workerId,
        workerGroup: extra?.workerGroup,
        launchConfigId,
      });

      try {
        await error.create(this.db);
      } catch (err) {
        if (!err || err.code !== 'EntityAlreadyExists') {
          throw err;
        }
        const existing = await this.WorkerPoolError.get(this.db, { errorId, workerPoolId: workerPool.workerPoolId });
        if (existing.title !== title || existing.providerData.kind !== kind) {
          throw new ApiError('error already exists');
        }
        error = existing;
      }
    } catch (err) {
      this.monitor.reportError(err, { workerPool, kind, title });
    } finally {
      // eslint-disable-next-line no-unsafe-finally
      return error;
    }
  }

  /**
   * Create a monitor object suitable for logging about a worker
   * @param {Object} options
   * @param {import('../data.js').Worker} options.worker
   * @param {Object} options.extra
   */
  workerMonitor({ worker, extra = {} }) {
    return this.monitor.childMonitor({
      workerPoolId: worker.workerPoolId,
      providerId: worker.providerId,
      workerGroup: worker.workerGroup,
      workerId: worker.workerId,
      ...extra,
    });
  }

  hashKey(idents) {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(idents))
      .digest('hex');
  }

  isDuplicate(...idents) {
    return _.indexOf(this.emailCache, this.hashKey(idents)) !== -1;
  }

  markSent(...idents) {
    this.emailCache.unshift(this.hashKey(idents));
    this.emailCache = _.take(this.emailCache, 1000);
  }

  static calcSeenTotal(seen = {}) {
    return Object.values(seen).reduce((sum, seen) => sum + seen, 0);
  }

  /** @param {import('../data.js').Worker} worker */
  static ensureWorkerManagerData(worker) {
    worker.providerData = worker.providerData || {};
    worker.providerData.workerManager = worker.providerData.workerManager || {};
    return worker.providerData.workerManager;
  }

  /** @param {import('../data.js').Worker} worker */
  static getWorkerManagerData(worker) {
    return worker.providerData?.workerManager;
  }

  /** @param {number|string|Date|null} value */
  static timestampToMs(value) {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }
}

/**
 * An error which, if thrown from API-related Provider methods, will be returned to
 * the user as a 400 Bad Request error containing `err.message`.
 */
export class ApiError extends Error {
}

/**
 * Utility function for reportError
 * @param {Object} options
 * @param {Object} options.extra
 * @param {string} options.workerPoolId
 * @param {string} options.description
 * @param {string} options.errorId
 * @returns {string} Formatted email message
 */
const getExtraInfo = ({ extra, workerPoolId, description, errorId }) => {
  let extraInfo = '';
  if (Object.keys(extra).length) {
    extraInfo = `
It includes the extra information:

\`\`\`
${yaml.dump(extra)}
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
