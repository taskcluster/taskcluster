import assert from 'assert';
import libUrls from 'taskcluster-lib-urls';
import slugid from 'slugid';
import yaml from 'js-yaml';
import { Worker, WorkerPoolError } from '../data.js';

/**
 * The parent class for all providers.
 *
 * See ../../providers.md for information on writing providers.
 */
export class Provider {
  constructor({
    providerId,
    notify,
    db,
    monitor,
    rootUrl,
    estimator,
    validator,
    providerConfig,
    providerType,
    publisher,
  }) {
    assert(db, 'db is required');
    assert(estimator, 'estimator is required');
    assert(monitor, 'monitor is required');
    assert(notify, 'notify is required');
    assert(validator, 'validator is required');
    assert(publisher, 'publisher is required');

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

  async provision({ workerPool, workerInfo }) {
  }

  async deprovision({ workerPool }) {
  }

  async registerWorker({ worker, workerPool, workerIdentityProof }) {
    throw new ApiError('not supported for this provider');
  }

  async cleanup() {
  }

  async scanPrepare() {
  }

  async checkWorker({ worker }) {
  }

  async scanCleanup() {
  }

  async createWorker({ workerPool, workerGroup, workerId, input }) {
    throw new ApiError('not supported for this provider');
  }

  async updateWorker({ workerPool, worker, input }) {
    throw new ApiError('not supported for this provider');
  }

  async removeWorker({ worker, reason }) {
    throw new ApiError('not supported for this provider');
  }

  async onWorkerRequested({ worker, terminateAfter }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerRequested',
      extraLog: { terminateAfter },
    });
  }

  async onWorkerRunning({ worker }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerRunning',
    });
  }

  async onWorkerStopped({ worker }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerStopped',
    });
  }

  async onWorkerRemoved({ worker, reason = 'unknown' }) {
    return this._onWorkerEvent({
      worker,
      event: 'workerRemoved',
      extraLog: { reason },
      extraPublish: { reason },
    });
  }

  async _onWorkerEvent({ worker, event, extraLog = {}, extraPublish = {} }) {
    assert(['workerRequested', 'workerRunning', 'workerStopped', 'workerRemoved'].includes(event), 'unknown event');
    this.monitor.log[event]({
      workerPoolId: worker.workerPoolId,
      providerId: this.providerId,
      workerId: worker.workerId,
      workerGroup: worker.workerGroup,
      ...extraLog,
    });

    await this.publisher[event]({
      workerPoolId: worker.workerPoolId,
      providerId: this.providerId,
      workerId: worker.workerId,
      workerGroup: worker.workerGroup,
      capacity: worker.capacity,
      timestamp: new Date().toJSON(),
      ...extraPublish,
    });
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
   */
  static isZombie({ worker }) {
    const queueInactivityTimeout = worker.providerData?.queueInactivityTimeout || 7200 * 1000;

    const lastActiveAfter = Date.now() - queueInactivityTimeout;
    const isOlderThanTimeout = (date) => date?.getTime() < lastActiveAfter;

    let reason = null;
    let isZombie = false;

    if (!worker.firstClaim && isOlderThanTimeout(worker.created)) {
      isZombie = true;
      reason = `worker never claimed work, created=${worker.created}, queueInactivityTimeout=${queueInactivityTimeout / 1000}s`;
    }

    if (!worker.lastDateActive && isOlderThanTimeout(worker.firstClaim)) {
      isZombie = true;
      reason = `worker never reclaimed work, firstClaim=${worker.firstClaim}, queueInactivityTimeout=${queueInactivityTimeout / 1000}s`;
    }

    if (isOlderThanTimeout(worker.lastDateActive)) {
      isZombie = true;
      reason = `worker inactive, lastDateActive=${worker.lastDateActive}, queueInactivityTimeout=${queueInactivityTimeout / 1000}s`;
    }

    return { reason, isZombie };
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

  // Report an error concerning this worker pool.  This handles notifications and logging.
  async reportError({ workerPool, kind, title, description, extra = {} }) {
    const errorId = slugid.v4();
    let error = this.WorkerPoolError.fromApi({
      workerPoolId: workerPool.workerPoolId,
      errorId,
      reported: new Date(),
      kind,
      title,
      description,
      extra,
    });

    try {
      if (workerPool.emailOnError) {
        await this.notify.email({
          address: workerPool.owner,
          subject: `Taskcluster Worker Manager Error: ${title}`,
          content: getExtraInfo({ extra, description, workerPoolId: workerPool.workerPoolId, errorId }),
        });
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

  static calcSeenTotal(seen = {}) {
    return Object.values(seen).reduce((sum, seen) => sum + seen, 0);
  }
}

/**
 * An error which, if thrown from API-related Provider methods, will be returned to
 * the user as a 400 Bad Request error containing `err.message`.
 */
export class ApiError extends Error {
}

// Utility function for reportError
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
