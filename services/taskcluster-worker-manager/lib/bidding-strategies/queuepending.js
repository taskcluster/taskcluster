'use strict';

const {BiddingStrategy} = require('../bidding-strategy');

const taskcluster = require('taskcluster-client');

class QueuePending extends BiddingStrategy {

  /**
   * Construct a QueuePending bidding strategy.  This bidding strategy
   * preserves the old behaviour of the AWS Provisioner V2 codebase as close as
   * possible.  Dependency injection is not directly supported, to ensure that
   * the constructor arguments are always JSON-serializable and can be passed
   * directly from the service configuration file (e.g. config.yml).
   *
   * For unit testing with a different queue object, the property `_queue`
   * (e.g. instance._queue) will be defined and supported as a
   * taskcluster-client Queue object which can be substituted using Sinon or
   * similar purpose libraries.
   */
  constructor({rootUrl, credentials}) {
    super({id: 'queue-pending-rootUrl'});
    this._queue = new taskcluster.Queue({rootUrl, credentials});
  }

  /**
   * Internal utility method wrapping the actual queue call for easy
   * mocking in unit tests
   */
  async _getPending(workerType) {
    let {pendingTasks} = await this._queue.pendingTasks('worker-manager', workerType);
    return pendingTasks;
  }

  /**
   * Given a workerType and biddingStrategyData, determine how much 
   * demand there is for this workerType.
   */
  async determineDemand({workerType, biddingStrategyData}, runningCapacity, pendingCapacity) {
    let {
      scalingRatio,
      minCapacity,
      maxCapacity,
      minPrice,
      maxPrice,
    } = biddingStrategyData;
    
    // TODO: we need to pass in pending and running capacity into all bidding
    // strategies so that they may calculate demenand based on overall capacity
    // available and planned without having to talk to providers

    let pending = await this._getPending(workerType);

    // NOTE: The following code of this function was copied verbatim from the
    // aws-provisoner-v1 codebase, changed only to address different variable
    // scoping (e.g. removing `this.` for property lookups and removing logging
    // which is not set up in this repository at the time of writing

    // scalingRatio = 0.2 => keep pending tasks as 20% of runningCapacity
    // scalingRatio = 0   => keep pending tasks as  0% of runningCapacity
    let desiredPending = Math.round(scalingRatio * runningCapacity);

    // desiredPending < pending - pendingCapacity    =>   Create spot requests
    // otherwise Cancel spot requests
    let capacityChange = pending - pendingCapacity - desiredPending;

    // capacityChange > 0  => Create spot requests for capacityChange
    // capacityChange < 0  => cancel spot requests for capacityChange
    let capacityAfterChange = capacityChange + pendingCapacity + runningCapacity;

    if (capacityAfterChange >= maxCapacity) {
      // If there is more than max capacity we should always aim for maxCapacity
      return maxCapacity - runningCapacity - pendingCapacity;
    } else if (capacityAfterChange < minCapacity) {
      return minCapacity - runningCapacity - pendingCapacity;
    }

    // If we're not hitting limits, we should aim for the capacity change that
    // fits with the scalingRatio, to keep pending tasks around as a percentage
    // of the running capacity.
    return capacityChange;
  }

  /**
   * Determine the value of a bid.  This is a theoretical number only used
   * for comparing to other bids, not any value ever passed to an api or
   * saved
   */
  _bidValue(bid) {
    // First we'll get the standard price per Capacity unit
    let value = bid.valuePerCapacity();

    // Deprioritize non-firm bids, but only if they're less than 20% cheaper
    if (!bid.firm) {
      value /= 0.8;
    }

    // For each 10 minutes of estimated delay, remove priority by 5%
    let delayPenalty = bid.estimatedDelay / 600000;
    value /= 1 - (delayPenalty / (100/5));
  
    return value;
  }

  /**
   * Compare two bids for sorting.  This comparison function is unique to this
   * bidding strategy.  This comparison function, when used with
   * Array.prototype.sort() will result in the "best" bid resulting at the
   * first index and the worst at the last index.
   */
  _compareBid(a, b) {
    // return < 0, a goes first (i.e. a is better bid)
    // return > 0, b goes first (i.e. b is better bid)
    return this._bidValue(a) - this._bidValue(b);
  }

  async selectBids({workerType, biddingStrategyData, bids, demand}) {
    let outcome = {accept: [], reject: []};
    
    // Avoid modifying bids list passed in
    let _bids = bids.slice();
    _bids.sort(this._compareBid.bind(this));

    // Select the best bids until we've selected enough to fulfill the demand,
    // then reject remaining bids
    for (let bid of _bids) {
      if (demand > 0 && new Date() <= bid.expires) {
        demand -= bid.capacity;
        outcome.accept.push(bid.id);
      } else {
        outcome.reject.push(bid.id);
      }
    }

    return outcome;
  }

}

module.exports = {
  QueuePending,
};
