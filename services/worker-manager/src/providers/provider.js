const assert = require('assert');
const libUrls = require('taskcluster-lib-urls');

class Provider {

  /**
   * There should not be any provisioning-specific work in the constructor.
   * This should just be setting up things like credentials needed to access
   * a cloud provider for terminating/listing instances. Any provisioning
   * logic should be started in `initiate` below.
   */
  constructor({
    providerId,
    monitor,
    notify,
    rootUrl,
    taskclusterCredentials,
    estimator,
    validator,
    Worker,
    WorkerPool,
    WorkerPoolError,
  }) {
    this.providerId = providerId;
    this.monitor = monitor;
    this.validator = validator;
    this.notify = notify;
    this.rootUrl = rootUrl;
    this.taskclusterCredentials = taskclusterCredentials;
    this.estimator = estimator;
    this.Worker = Worker;
    this.WorkerPool = WorkerPool;
    this.WorkerPoolError = WorkerPoolError;
  }

  /**
   * This is called at process start-up for all configured providers (that is,
   * once for each providerId).  It can be used as an "async constructor" such
   * as to set up object properties that must be awaited.  It can also be used
   * to construct provider-global objects in a cloud service, for example.
   */
  async setup() {
  }

  /**
   * This is only called for providers that are being used in background jobs such
   * as provisioning and scanning workers.
   * If there's any taskcluster-lib-iterate loops to
   * run, this is where they should be initiated.
   */
  async initiate() {
  }

  /**
   * Terminate any code which was started by .initiate();
   */
  async terminate() {
  }

  /**
   * Given a worker pool configuration, this will ensure that it matches the
   * configuration schema for the implementation of a provider.
   * Returns null if everything is fine and an error message if not.
   */
  validate(config) {
    assert(this.configSchema); // This must be set up by a provider impl
    return this.validator(config, libUrls.schema(this.rootUrl, 'worker-manager', `v1/${this.configSchema}.yml`));
  }

  /**
   * Anything a provider may want to do every provisioning loop but not tied
   * to any one worker pool. Called _before_ provision() is called.
   */
  async prepare() {
  }

  /**
   * Given a worker pool configuration, do whatever the provider might
   * do with this worker pool. This may mean nothing at all in the case of
   * static provider!
   */
  async provision({workerPool}) {
  }

  // This is the oposite of provision. Given a worker pool, tear down whatever
  // resources this provider has created for it. Once complete, remove yourself
  // from the worker pool's list of previous providers.
  async deprovision({workerPool}) {
  }

  /**
   * Anything a provider may want to do every provisioning loop but not tied
   * to any one worker pool. Called _after_ all provision() calls are complete.
   * You may want to use this time to remove outdated worker pools for instance.
   */
  async cleanup() {
  }

  /*
   * Called before an iteration of the worker scanner
   */
  async scanPrepare() {
  }

  /*
   * Called for every worker on a schedule so that we can update the state of
   * the worker locally
   */
  async checkWorker({Worker}) {
  }

  /*
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
  }

  /**
   * Called when a new worker pool is added to this provider to allow the provider
   * to do whatever setup is necessary
   */
  async createResources({workerPool}) {
  }

  /**
   * Called whenever a worker pool currently assigned to this provider is changed.
   * If a currently existing worker pool is moved to a different provider, the old provider
   * will actually be asked to remove resources and the new one to create. This will not
   * be called in that case.
   */
  async updateResources({workerPool}) {
  }

  /**
   * Called when a worker pool is removed and this provider was providing for it.
   */
  async removeResources({workerPool}) {
  }
}

module.exports = {
  Provider,
};
