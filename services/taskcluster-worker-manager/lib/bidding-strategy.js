'use strict';

const {WMObject, errors} = require('./base');

/**
 * A Bidding Strategy implementation is a class which understands the details
 * of how to show demand and select bids.  Bids are instances of the Bid class.
 * To explain the terms of a bidding strategy's responsibilities, the example
 * of a Taskcluster Queue bidding system similar to the aws-provisioner-v1
 * provisioner is used as example.
 *
 * The bidding strategy will use the determineDemand to determine what demand
 * exists for each worker type.  In the example case, this would involve
 * calling the Queue's pendingTasks method and using the passed bidding
 * strategy data to compare to the definied limits, as calcuated with any
 * scaling ratios to decide
 *
 * The bidding strategy will also understand how to pick between bids from a
 * provider.  The providers will each propose a number of bids for a given
 * demand, the Bidding Strategy is responsible for determining which bids it
 * would like to pick for fulfilment.
 *
 * It is important to note that a Bidding Strategy should only concern itself
 * with determining demand and selecting bids.  It should never understand how
 * to create or manage capacity.  Efforts are made to block non bidding
 * strategy data from being visible to the bidding strategy.
 */
class BiddingStrategy extends WMObject {

  /**
   * Default constructor
   */
  constructor({id}) {
    super({id});
  }

  /**
   * Any code which is required to be run by this Bidding Strategy must only be
   * initiated by this method.  If there's any taskcluster-lib-iterate loops to
   * run, this is where they should be initiated.  Once the returned promise is
   * resolved, the Bidding Strategy must be fully working.
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
   * Given an object {workerType, biddingStrategyData}, return an integer which
   * represents the number of capacity units which are needed to be created or
   * destroyed.  Determining per-provider maximum capacity is not in scope for
   * this method.  Each provider, if it wishes to implement this feature should
   * handle it internally and only provide bids up to its internal max.
   */
  async determineDemand({workerType, biddingStrategyData}) {
    this._throw(errors.MethondUnimplemented, 'BiddingStrategy.determineDemand()');
  }

  /**
   * This method must return a list which is a subset of the bids provided
   * which would satisfy at most `demand` capacity units for `workerType`, plus
   * at most one more bid.  In other words, if the instances proposed have a
   * capacity of 4 and there's a request for 18 capacity, the selected bids
   * could be for at most 5 instances.  This is to ensure that there's always
   * at least the requested capacity without limiting the bids to be smaller
   * than ideal in order to not exceed the capacity.
   *
   * This method must not mutate the bids in any way and should not look at the
   * providerData property on the bid
   *
   * Must return an object in the shape {accept: [<Bid.id>], reject:
   * [<Bid.id>]}
   *
   * When considering price, it is critical to use the Bid.valuePerCapacity()
   * method as it is the correct way to generate a comparable value of the bid.
   */
  async selectBids({workerType, biddingStrategyData, bids, demand}) {
    this._throw(errors.MethondUnimplemented, 'BiddingStrategy.selectBids()');
  }
}

// Load a bidding strategy class
BiddingStrategy.load = function(className) {
  return loadPlugin(BiddingStrategy, 'bidding-strategies', className);
}


module.exports = {
  BiddingStrategy,
};
