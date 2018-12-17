'use strict';

const {QueuePending} = require('../../lib/bidding-strategies/queuepending');
const {testBiddingStrategy, createMockBid} = require('./bidding-strategies_test.js');
const sinon = require('sinon');
const assume = require('assume');

suite('QueuePending Bidding Strategy', () => {
  let subject = new QueuePending({
    rootUrl: 'https://fake.example.com',
    credentials: {},
  });
  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(subject, '_getPending');
    subject._getPending.returns(0);
  })

  teardown(() => {
    sandbox.restore();
  })

  // Since this is a throw-away object this is a simple stub.  It might
  // be worthwhile in the future using Sinon here

  testBiddingStrategy(subject, {
    scalingRatio: 1,
    minCapacity: 0,
    maxCapacity: 1000,
    minPrice: 0,
    maxPrice: 1000,
  });

  test('calculates simple demand correct', async () => {
    subject._getPending.returns(100);

    let demand = await subject.determineDemand({workerType: 'workerType', biddingStrategyData: {
      scalingRatio: 1,
      minCapacity: 0,
      maxCapacity: 1000,
      minPrice: 0,
      maxPrice: 1000,
    }}, 50, 10);

    assume(demand).equals(40);
  });

  test('does not allow more than max capacity', async () => {
    subject._getPending.returns(100000);

    let demand = await subject.determineDemand({workerType: 'workerType', biddingStrategyData: {
      scalingRatio: 1,
      minCapacity: 0,
      maxCapacity: 1000,
      minPrice: 0,
      maxPrice: 1000,
    }}, 10, 10);

    assume(demand).equals(980);
  });

  test('does not allow less than min capacity', async () => {
    subject._getPending.returns(0);

    let demand = await subject.determineDemand({workerType: 'workerType', biddingStrategyData: {
      scalingRatio: 1,
      minCapacity: 1000,
      maxCapacity: 10000,
      minPrice: 0,
      maxPrice: 1000,
    }}, 10, 10);

    assume(demand).equals(980);
  });

  test('calculates scaling ratio correctly', async () => {
    subject._getPending.returns(500);

    let demand = await subject.determineDemand({workerType: 'workerType', biddingStrategyData: {
      scalingRatio: 0.5,
      minCapacity: 1000,
      maxCapacity: 10000,
      minPrice: 0,
      maxPrice: 1000,
    }}, 500, 500);

    assume(demand).equals(0);
  });

  async function selectsCorrectBid(good, bad) {
    let {accept, reject} = await subject.selectBids({workerType: 'workerType',
      biddingStrategyData: {
        scalingRatio: 1,
        minCapacity: 1000,
        maxCapacity: 10000,
        minPrice: 0,
        maxPrice: 1000,
      }, bids: [bad, good], demand: 10});
    assume(accept).deeply.equals([good.id, bad.id]);
  }

  test('select bids picks the cheaper bid', async () => {
    let good = createMockBid({price: 1});
    let bad = createMockBid({price: 2});
    await selectsCorrectBid(good, bad);
  });

  test('select bids picks the higher capacity bid', async () => {
    let good = createMockBid({capacity: 2});
    let bad = createMockBid({capacity: 1});
    await selectsCorrectBid(good, bad);
  });

  test('select bids picks the firm bid', async () => {
    let good = createMockBid({firm: true});
    let bad = createMockBid({firm: false});
    await selectsCorrectBid(good, bad);
  });

  test('select bids picks the higher utility factor bid', async () => {
    let good = createMockBid({utilityFactor: 2});
    let bad = createMockBid({utilityFactor: 1});
    await selectsCorrectBid(good, bad);
  });

  test('select bids picks the lower estimated delay bid', async () => {
    let good = createMockBid({estimatedDelay: 10});
    let bad = createMockBid({estimatedDelay: 3600*1000});
    await selectsCorrectBid(good, bad);
  });

});
