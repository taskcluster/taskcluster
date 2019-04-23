class Provider {

  /**
   * There should not be any provisioning-specific work in the constructor.
   * This should just be setting up things like credentials needed to access
   * a cloud provider for terminating/listing instances. Any provisioning
   * logic should be started in `initiate` below.
   */
  constructor({name, monitor, notify, provisionerId, rootUrl, taskclusterCredentials}) {
    this.name = name;
    this.monitor = monitor;
    this.notify = notify;
    this.provisionerId = provisionerId;
    this.rootUrl = rootUrl;
    this.taskclusterCredentials = taskclusterCredentials;
  }

  /**
   * Given a list of workerTypes and states, list the applicable workers.  The
   * return value must be a list of Worker objects.  The workerTypes value must
   * be a list of strings.  If the workerTypes value is not specified, all
   * workerTypes should be included.  The states value must be a list of states
   * strings.  These are in Provider.states.  These values are not extensible.
   * All providers must group their internal states to one of the states in
   * Provider.states.  If any state is not in Provider.states, an error must be
   * thrown.
   */
  async listWorkers({states, workerTypes}) {
    throw new Error('Method Unimplemented!');
  }

  /**
   * Given a worker id, check if it is managed by this provider and if so,
   * determine its state.  Must return the correct Provider.state string if
   * managed or undefined if not
   */
  async queryWorkerState({workerId}) {
    throw new Error('Method Unimplemented!');
  }

  /**
   * Given a Worker instance, return provider specific information which
   * might be useful to a user interface.  For example, an EC2 provider
   * might wish to return {region: 'us-east-1'}
   */
  workerInfo({worker}) {
    throw new Error('Method Unimplemented!');
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
