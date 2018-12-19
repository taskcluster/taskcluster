'use strict';

const assume = require('assume');
const {BiddingStrategy} = require('../../lib/bidding-strategy');
const {Bid} = require('../../lib/bid');
const sinon = require('sinon');

/**
 * This file contains tests runner for all implemenetations of a bidding
 * strategy.  All bidding strategies must pass this suite
 */

const workerType = 'workerType';

/**
 * Create a list of bids with the capacities specified in the `capacities`
 * list.  Each bid is identical other than the capacity
 */
function createBids(...capacities) {
  let bids = [];

  for (let capacity of capacities) {
    bids.push(new Bid({
      workerConfigurationId: 'worker-configuration-1',
      providerId: 'test-provider',
      workerType,
      expires: new Date(Date.now() + 3600*1000),
      capacity,
      utilityFactor: 1,
      price: 1,
      firm: false,
      reliability: 7000,
      estimatedDelay: 1000,
      providerData: {}
    }));
  }

  return bids;
}

/**
 * Create a single mock bid using some defaults, overriding those
 * properties which are passed in on the overrides object
 */
function createMockBid(overrides) {
  return new Bid(Object.assign({}, {
    workerConfigurationId: 'worker-configuration-1',
    providerId: 'test-provider',
    workerType,
    expires: new Date(Date.now() + 3600*1000),
    capacity: 1,
    utilityFactor: 1,
    price: 1,
    firm: false,
    reliability: 7000,
    estimatedDelay: 1000,
    providerData: {}
  }, overrides));
}

/**
 * Test a Bidding Strategy.  `runBefore` and `runAfter` are methods which will
 * be run before and after the tests complete.  They are named so as not to
 * conflict with any mocha tdd/bdd interface methods.  These methods will be
 * run with the await keyword and will be run with the instance of `clazz` as
 * the only parameter.
 *
 * In pseudo code, these setup and teardown methods will be run like:
 * await runBefore(subject);
 * ... (tests)
 * await runAfter(subject);
 *
 * The assumption is that these tests can safely call the api methods as many
 * times as needed and nothing will happen externally.  In otherwords, the
 * bidding strategy must be fully mocked.
 *
 * The `biddingStrategyData` parameter must be a worker configuration
 * evaluation output which is valid for this bidding strategy.  It must use a
 * workerType value of `workerType`
 *
 */
function testBiddingStrategy(subject, biddingStrategyData, runBefore, runAfter) {
  suite(`Bidding Strategy API Conformance for ${subject.constructor.name}`, () => {
    let workerType = 'workerType';
    let sandbox = sinon.createSandbox();

    setup(async () => {
      if (runBefore) {
        await runBefore(subject);
      }
    });

    teardown(async () => {
      if (runAfter) {
        await runAfter(subject);
      }
    });

    test('instance is subclass of BiddingStrategy', async () => {
      assume(subject).inherits(BiddingStrategy);
    });

    test('all api mandated methods exist', async () => {
      assume(subject.initiate).is.a('asyncfunction');
      assume(subject.terminate).is.a('asyncfunction');
      assume(subject.determineDemand).is.a('asyncfunction');
      assume(subject.selectBids).is.a('asyncfunction');
    });

    test('.determineDemand() should work with no capacity', async () => {
      let demand = await subject.determineDemand({workerType, biddingStrategyData}, 0, 0);

      assume(demand).is.a('number');
    });

    test('.determineDemand() should work with only running capacity', async () => {
      let demand = await subject.determineDemand({workerType, biddingStrategyData}, 10, 0);

      assume(demand).is.a('number');
    });

    test('.determineDemand() should work with only pending capacity', async () => {
      let demand = await subject.determineDemand({workerType, biddingStrategyData}, 0, 10);

      assume(demand).is.a('number');
    });

    test('.determineDemand() should work with pending and running capacity', async () => {
      let demand = await subject.determineDemand({workerType, biddingStrategyData}, 10, 10);
      assume(demand).is.a('number');
    });

    test('.selectBids() should return an empty list when passed an empty list but demand', async () => {
      let result = await subject.selectBids({workerType, biddingStrategyData, bids: [], demand: 10});
      assume(result.accept).length(0);
      assume(result.reject).length(0);
    });

    test('.selectBids() should select no more than demand capacity + one bid', async () => {
      let bids = createBids(3, 3, 3, 3, 3);
      let result = await subject.selectBids({workerType, biddingStrategyData, bids, demand: 10});

      assume(result.accept).length(4);
      assume(result.reject).length(1);
    });
  });
}

module.exports = {
  createBids,
  createMockBid,
  testBiddingStrategy,
}
