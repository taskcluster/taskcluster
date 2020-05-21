const assert = require('assert');
const libUrls = require('taskcluster-lib-urls');
const slugid = require('slugid');
const yaml = require('js-yaml');

/**
 * The parent class for all providers.
 *
 * See ../../providers.md for information on writing providers.
 */
class Provider {
  constructor({
    providerId,
    notify,
    db,
    monitor,
    rootUrl,
    estimator,
    Worker,
    WorkerPoolError,
    validator,
    providerConfig,
  }) {
    this.providerId = providerId;
    this.monitor = monitor;
    this.validator = validator;
    this.notify = notify;
    this.db = db;
    this.rootUrl = rootUrl;
    this.estimator = estimator;
    this.Worker = Worker;
    this.WorkerPoolError = WorkerPoolError;
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

  async provision({workerPool, workerInfo}) {
  }

  async deprovision({workerPool}) {
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    throw new ApiError('not supported for this provider');
  }

  async cleanup() {
  }

  async scanPrepare() {
  }

  async checkWorker({worker}) {
  }

  async scanCleanup() {
  }

  async createWorker({workerPool, workerGroup, workerId, input}) {
    throw new ApiError('not supported for this provider');
  }

  async removeWorker({worker, reason}) {
    throw new ApiError('not supported for this provider');
  }

  async createResources({workerPool}) {
  }

  async updateResources({workerPool}) {
  }

  async removeResources({workerPool}) {
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
  static interpretLifecycle({lifecycle: {registrationTimeout, reregistrationTimeout} = {}}) {
    reregistrationTimeout = reregistrationTimeout || 345600;
    let terminateAfter = null;

    if (registrationTimeout !== undefined && registrationTimeout < reregistrationTimeout) {
      terminateAfter = Date.now() + registrationTimeout * 1000;
    } else {
      terminateAfter = Date.now() + reregistrationTimeout * 1000;
    }

    return {terminateAfter, reregistrationTimeout: reregistrationTimeout * 1000};
  }

  // Report an error concerning this worker pool.  This handles notifications and logging.
  async reportError({workerPool, kind, title, description, extra = {}}) {
    const errorId = slugid.v4();

    try {
      if (workerPool.emailOnError) {
        await this.notify.email({
          address: workerPool.owner,
          subject: `Taskcluster Worker Manager Error: ${title}`,
          content: getExtraInfo({extra, description, workerPoolId: workerPool.workerPoolId, errorId}),
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

    } finally {
      // eslint-disable-next-line no-unsafe-finally
      return await this.WorkerPoolError.create({
        workerPoolId: workerPool.workerPoolId,
        errorId,
        reported: new Date(),
        kind,
        title,
        description,
        extra,
      });
    }
  }

  /**
   * Create a monitor object suitable for logging about a worker
   */
  workerMonitor({worker, extra = {}}) {
    return this.monitor.childMonitor({
      workerPoolId: worker.workerPoolId,
      providerId: worker.providerId,
      workerGroup: worker.workerGroup,
      workerId: worker.workerId,
      ...extra,
    });
  }

}

/**
 * An error which, if thrown from API-related Provider methods, will be returned to
 * the user as a 400 Bad Request error containing `err.message`.
 */
class ApiError extends Error {
}

module.exports = {
  Provider,
  ApiError,
};

// Utility function for reportError
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
