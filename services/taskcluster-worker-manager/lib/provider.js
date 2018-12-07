'use strict';

const {WMObject, errors, loadPlugin} = require('./base');

/**
 * A Provider implementation is a class which understands the details of a
 * specific resource pool.  For explaining the terms of the Provider model, an
 * example of an EC2 region is used.  This is not to suggest it being
 * impossible for other systems.
 *
 * Each provider needs to be able to list the instances which are managed by
 * it.  Each instance must be uniquely identifiable. This is because we need to
 * have tools to terminate specific instances which are problematic as well as
 * attribute specific task runs to workers.  The provider must also be able to
 * suggest bids for new capacity.  This will be based on the outcome of a call
 * to determine the demand of a specific bidding strategy.
 *
 * The Bid class will be used to represent the various bids being passed
 * between providers and bidding strategies.
 *
 * The provider must understand that workerTypes which no longer have an
 * associated worker configuration might still exist, so it must internally map
 * between instance and worker type.  In the EC2 case, this is acheived by tagging
 * each instance with the providerId and workerType fields.
 *
 * It is important to note that a Provider implementation should only concern
 * itself with providing and managing capacity.  It should never independently
 * decide to create capacity.  Another way to think of it is that a provider is
 * an adapter between the interface that Worker Manager expects and that
 * provided by the backing service.
 */
class Provider extends WMObject {

  /**
   * Create a provider.  The id for a provider is used within the taskcluster
   * system as the workerGroup value.  In the case of an EC2 instance, this
   * would look something like "ec2_us-east-1".  In the case of a second
   * instance of the ec2 provider running in us-east-1, the second might have an
   * id of "alternate-ec2_us-east-1".  If a mapping between
   * id and any provider concept (e.g. region) is important, it must
   * be managed by the provider itself.
   */
  constructor({id}) {
    super({id});
  }

  /**
   * Given a list of workerTypes and states, list the applicable workers.  The
   * return value must be a list of Worker objects.  The workerTypes value must
   * be a list of strings.  If the workerTypes value is not specified, all
   * workerTypes should be included.  The states value must be a list of states
   * symbols.  These are in Provider.states.  These values are not extensible.
   * All providers must group their internal states to one of the states in
   * Provider.states.  If any state is not in Provider.states, an error must be
   * thrown.
   */
  async listWorkers({states, workerTypes}) {
    this._throw(errors.MethondUnimplemented, 'Provider.listWorkers()');
  }

  /**
   * Given a worker id, check if it is managed by this provider and if so,
   * determine its state.  Must return the correct Provider.state symbol if
   * managed or undefined if not
   */
  async queryWorkerState({workerId}) {
    this._throw(errors.MethondUnimplemented, 'Provider.queryWorkers()');
  }

  /**
   * Given a Worker instance, return provider specific information which
   * might be useful to a user interface.  For example, an EC2 provider
   * might wish to return {region: 'us-east-1'}
   */
  workerInfo({worker}) {
    this._throw(errors.MethondUnimplemented, 'Provider.workerInfo()');
  }

  /**
   * Any code which is required to be run by this Provider must only be
   * initiated by this method.  If there's any taskcluster-lib-iterate loops to
   * run, this is where they should be initiated.  Once the returned promise is
   * resolve, the Provider must be fully working.
   *
   * This method must not start anything which does actual provisioning, but
   * rather is intended to do things like update pricing information or
   * maintaining state in the underlying api.
   */
  async initiate() {
  }

  /**
   * Terminate any code which was started by .initiate();
   */
  async terminate() {
  }

  /**
   * This method must return a list of valid bids based on the results of an
   * internal evaluation of the workerConfiguration.  It should consider all
   * satisfiers which might be relevant in the execution.
   *
   * This method must do worker configuration evaluation as it sees fit, but
   * will be passed a workerConfiguration which only allows access to
   * providerData and workerType in the evaluation results.
   *
   * The number of bids returned is at the discretion of the Provider author.
   * Consideration should be taken to not do bad things, like return 10,000,000
   * bids for a demand of 1.
   *
   * It is the provider's responsibility to ensure that the bid is valid for the
   * provider.  Things like checking structural validity must be handled
   * within the provider, since the rest of the worker manager will treat
   * these values as opaque.
   *
   * If this provider must track maximum instance counts, it must track this
   * internally as this is considered to be a provider concern
   */
  async proposeBids({workerType, workerConfiguration, demand}) {
    this._throw(errors.MethondUnimplemented, 'Provider.proposeBids()');
  }

  /**
   * Submit the provided set of bids.  If this provider internally tracks the
   * state of pending bids, they should be marked as resolved.
   *
   * This method should not throw because the bids are rejected internally.
   * Each provider should try to retry failed bids, and mark them internally
   * against any reliability scores used to determine whether to offer similar
   * bids in the future.
   *
   * No return value is expected.  This function should only throw an error if
   * the bids parameter is malformed.
   */
  async submitBids({bids}) {
    this._throw(errors.MethondUnimplemented, 'Provider.submitBids()');
  }

  /**
   * Mark unused bids as rejected.  This is to account for a system like
   * provisioning a fixed size pool in case a provider wanted to do resource
   * counting so that it never suggests the same resource for more than one
   * bid.  Since the majority of providers will not implement this behaviour, a
   * default non-operation implementation is provided.
   *
   * No return value is expected.  This function should only throw an error if
   * the bids parameter is malformed.
   */
  async rejectBids({bids}) {
  }

  /**
   * Terminate all workers managed by this provider.  This method must not
   * return until the request to terminate all workers is completed.  It does
   * not need to wait until all workers actually terminate.
   */
  async terminateAllWorkers() {
    this._throw(errors.MethondUnimplemented, 'Provider.terminateAllWorkers()');
  }

  /**
   * Terminate all workers of a specific worker type.  This method must not
   * return until the request to terminate workers is completed.  It does not
   * need to wait until all workers actually terminate.
   */
  async terminateWorkerType({workerType}) {
    this._throw(errors.MethondUnimplemented, 'Provider.terminateWorkerType()');
  }

  /**
   * Terminate specific workers.  This method must take either a list of worker
   * ids or Worker instances and terminate all those which are provided.  This
   * method must not return until the request to terminate workers is
   * completed.  It does not need to wait until all workers actually terminate.
   */
  async terminateWorkers({workers}) {
    this._throw(errors.MethondUnimplemented, 'Provider.terminateWorkers()');
  }

}

// Load a provider class
Provider.load = function(className) {
  return loadPlugin(Provider, 'providers', className);
}

/**
 * These are the states which are valid and must be used for all providers as
 * their exposed states.  All internal states must map to these for the
 * purposes of interchange
 */
const validStates = [
  'requested', // Requested but not yet allocated
  'booting', // Allocated and is being prepared
  'running', // Running and accepting jobs
  'terminating', // No longer accepting jobs and shutting down
];

let states = {};

validStates.forEach(x => {
  states[x] = x; 
});

Provider.states = Object.freeze(states);

module.exports = {
  Provider,
}
