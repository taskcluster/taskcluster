const assert = require('assert');
const libUrls = require('taskcluster-lib-urls');

class Provider {

  /**
   * There should not be any provisioning-specific work in the constructor.
   * This should just be setting up things like credentials needed to access
   * a cloud provider for terminating/listing instances. Any provisioning
   * logic should be started in `initiate` below.
   */
  constructor({name, monitor, notify, provisionerId, rootUrl, taskclusterCredentials, estimator, Worker, validator}) {
    this.name = name;
    this.monitor = monitor;
    this.validator = validator;
    this.notify = notify;
    this.provisionerId = provisionerId;
    this.rootUrl = rootUrl;
    this.taskclusterCredentials = taskclusterCredentials;
    this.estimator = estimator;
    this.Worker = Worker;
  }

  /**
   * Given a workertype configuration, this will ensure that it matches the
   * configuration schema for the implementation of a provider.
   * Returns null if everything is fine and an error message if not.
   */
  validate(config) {
    assert(this.configSchema); // This must be set up by a provider impl
    return this.validator(config, libUrls.schema(this.rootUrl, 'worker-manager', `v1/${this.configSchema}.yml`));
  }

  /**
   * Anything a provider may want to do every provisioning loop but not tied
   * to any one workertype. Called _before_ provision() is called.
   */
  async prepare() {
  }

  /**
   * Given a WorkerType configuration, do whatever the provider might
   * do with this worker type. This may mean nothing at all in the case of
   * static provider!
   */
  async provision({workerType}) {
  }

  /**
   * Anything a provider may want to do every provisioning loop but not tied
   * to any one workertype. Called _after_ all provision() calls are complete.
   * You may want to use this time to remove outdated workertypes for instance.
   */
  async cleanup() {
  }

  /**
   * Any code which is required to be run by this Provider must only be
   * initiated by this method.  If there's any taskcluster-lib-iterate loops to
   * run, this is where they should be initiated.  Once the returned promise is
   * resolve, the Provider must be fully working.
   */
  async initiate() {
  }

  /**
   * Terminate any code which was started by .initiate();
   */
  async terminate() {
  }

  /**
   * Terminate all workers managed by this provider.  This method must not
   * return until the request to terminate all workers is completed.  It does
   * not need to wait until all workers actually terminate.
   */
  async terminateAllWorkers() {
    throw new Error('Method Unimplemented!');
  }

  /**
   * Terminate all workers of a specific worker type.  This method must not
   * return until the request to terminate workers is completed.  It does not
   * need to wait until all workers actually terminate.
   */
  async terminateWorkerType({workerType}) {
    throw new Error('Method Unimplemented!');
  }

  /**
   * Terminate specific workers.  This method must take either a list of worker
   * ids or Worker instances and terminate all those which are provided.  This
   * method must not return until the request to terminate workers is
   * completed.  It does not need to wait until all workers actually terminate.
   */
  async terminateWorkers({workers}) {
    throw new Error('Method Unimplemented!');
  }

}

module.exports = {
  Provider,
};
