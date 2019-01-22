'use strict';

const uuid = require('uuid');

const {WMObject, errors} = require('./base');

/**
 * A bid represents an offer of capacity from a provider.  The firm property is
 * to note that once a bid is made, the API of the service provider will
 * definitely start the instance, of course barring errors.  A value of true
 * means that the instance is definitely going to start up if selected and a
 * value of false means there is some delayed process to starting the bid.
 *
 * The reliability property is an integer between 1 and 10000 which defines how
 * reliable the provider thinks the instance will be.  A value of 1 means the
 * machine is assumed to immediately shutdown after booting.  A value of 10000
 * means that barring a natural disaster, the machine will be there.  For the
 * initial calibration, EC2 spot would have 2500, EC2 on-demand would have 7500
 * and an EC2 reserved instance would have 10000.  This can be hard coded or
 * derived from operational data.
 *
 * The estimatedDelay property is the number of milliseconds that the provider
 * thinks the instance will take to begin booting the work load.  It is not
 * intended to be a concrete value, but a guideline.  This can either be hard
 * coded or dervied from operational data.
 *
 * Each bid must be immutable, subject to no changes by the bidding strategy.
 * The providerData field must contain the information needed by the provider
 * to fulfil the selected bid.  This field can either store an identifier to a
 * bid within the provider's persistence (e.g providerData === uuid.v4()) or
 * can be a fully formed request which would be passed verbatim to the
 * underlying system which submits bids.  The specific approach is up to the
 * provider implementation.
 */
class Bid extends WMObject {
  constructor({
    providerId,
    workerType,
    workerConfigurationId,
    expires, // Time after which this bid must be summarily rejected
    price, // USD Real-wallet price for this bid, not per capacity
    capacity, // Divisor for price, e.g. $5 for 2 capacity = $2.5 per capacity
    utilityFactor, // Multiplier to account for differing utility of a capacity
    // unit in a bid versus the number of capacity units would suggest.
    // Consider the case of 1x CPU @ 2GHz vs 2x CPU @ 2.5GHz.  The second
    // likely provides a slightly higher performance level than double the
    // first.  Applied for each capacity unit
    firm, // true if the bid is guaranteed to fulfil (e.g. EC2 Reserved Instance)
    reliability,
    estimatedDelay, // Estimated time in ms before the bid is fulfilled.
    // Providers can either provide a static value or track this value over
    // time
    providerData, // Data for the provider to use to fulfil this bid.  Can
    // optionally be what the the provider submits to its underlying resource
    // or a reference to an internally tracked bid
  }) {
    super({id: `${providerId}_${workerType}_${uuid.v4()}`});
    this.generated = new Date();

    if (typeof providerId !== 'string') {
      this._throw(errors.InvalidBid, 'providerId must be string');
    }
    this.providerId = providerId;

    if (typeof workerType !== 'string') {
      this._throw(errors.InvalidBid, 'workerType must be string');
    }
    this.workerType = workerType;

    if (typeof workerConfigurationId !== 'string') {
      this._throw(errors.InvalidBid, 'workerConfigurationId must be string');
    }
    this.workerConfigurationId = workerConfigurationId;

    if (typeof expires !== 'object' || expires.constructor.name !== 'Date') {
      this._throw(errors.InvalidBid, 'expires must be a Date instance');
    }
    this.expires = expires;

    if (typeof price !== 'number') {
      this._throw(errors.InvalidBid, 'price must be a number');
    }
    this.price = price;

    if (typeof capacity !== 'number') {
      this._throw(errors.InvalidBid, 'capacity must be a number');
    }
    this.capacity = capacity;

    if (typeof utilityFactor !== 'number') {
      this._throw(errors.InvalidBid, 'utilityFactor must be a number');
    }
    this.utilityFactor = utilityFactor;

    if (typeof firm !== 'boolean') {
      this._throw(errors.InvalidBid, 'firm must be a boolean');
    }
    this.firm = firm;

    if (typeof reliability !== 'number') {
      this._throw(errors.InvalidBid, 'reliability must be number');
    }
    this.reliability = reliability;

    if (typeof estimatedDelay !== 'number') {
      this._throw(errors.InvalidBid, 'estimatedDelay must be number');
    }
    this.estimatedDelay = estimatedDelay;

    if (typeof providerData !== 'object') {
      this._throw(errors.InvalidBid, 'providerData must be object');
    }
    this.providerData = providerData;
  }

  /**
   * Calculate the USD value of each capacity unit provided by this bid.
   */
  valuePerCapacity() {
    return this.price / (this.capacity * this.utilityFactor);
  }
}

module.exports = {
  Bid,
}
