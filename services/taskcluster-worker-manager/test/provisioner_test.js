
const path = require('path');
const fs = require('fs');
const assume = require('assume');
const sinon = require('sinon');
const sandbox = sinon.createSandbox();
const moment = require('moment');

const {InMemoryDatastore} = require('../lib/data-storage');
const {Provisioner} = require('../lib/provisioner');
const {WorkerConfiguration} = require('../lib/worker-config');
const {Bid} = require('../lib/bid');
const {Provider} = require('../lib/provider.js');
const {BiddingStrategy} = require('../lib/bidding-strategy.js');

class FakeProvider extends Provider {
  constructor({region}) {
    super({id: `fake_${region}`});
  }

  async proposeBids() {}

  async submitBids() {}

  async rejectBids() {}

  async listWorkers() {
    return [];
  }

  createBid({price, capacity, utilityFactor}) {
    return new Bid({
      providerId: this.id,
      workerType: 'worker-type-1',
      workerConfigurationId: 'worker-configuration-1',
      expires: moment().add(1, 'hour').toDate(),
      price,
      capacity,
      utilityFactor,
      firm: false,
      reliability: 7500,
      estimatedDelay: 1000,
      providerData: {a:1},
    });
  }
}

class FakeBiddingStrategy extends BiddingStrategy {
  constructor() {
    super({id: 'fake'});
  }

  async determineDemand() {}

  async selectBids() {}
}

suite('Provisioner', () => {
  let datastore;
  let provider;
  let biddingStrategy;
  let provisioner;
  let workerConfigurationJSON;

  suiteSetup(done => {
    fs.readFile(path.join(__dirname, 'provisioner-example-worker-configuration.json'), (err, data) => {
      workerConfigurationJSON = JSON.parse(data);
      done(err);
    });
  });

  setup(() => {
    datastore = new InMemoryDatastore({id: 'worker-manager'});

    datastore.set('worker-configurations', 'worker-configuration-1', workerConfigurationJSON);

    provider = new FakeProvider({region: 'us-east-1'});
    biddingStrategy = new FakeBiddingStrategy();

    // We want to stub out the relevant provider and bidding strategy methods.
    // We're not stubbing out the whole method because we wish the default
    // behaviour of throwing for methods being unimplemented
    sandbox.stub(provider, 'proposeBids');
    sandbox.stub(provider, 'submitBids');
    sandbox.stub(provider, 'rejectBids');

    sandbox.stub(biddingStrategy, 'determineDemand');
    sandbox.stub(biddingStrategy, 'selectBids');

    let providers = new Map([[provider.id, provider]]);
    let biddingStrategies = new Map([[biddingStrategy.id, biddingStrategy]]);

    provisioner = new Provisioner({
      iterationGap: 1,
      providers,
      biddingStrategies,
      datastore,
    });
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should do nothing with 0 demand', async () =>{
    biddingStrategy.determineDemand
      .returns(0);

    await provisioner.provision();

    sandbox.assert.notCalled(provider.submitBids);
    sandbox.assert.notCalled(provider.rejectBids);
    sandbox.assert.notCalled(provider.proposeBids);
    sandbox.assert.notCalled(biddingStrategy.selectBids);

    sandbox.assert.calledOnce(biddingStrategy.determineDemand);
    sandbox.assert.calledWith(biddingStrategy.determineDemand.firstCall, {
      workerType: 'worker-type-1',
      biddingStrategyData: {minCapacity:0, maxCapacity:300},
    });

  });

  test('should do nothing with -1 demand', async () =>{
    biddingStrategy.determineDemand
      .returns(-1);

    await provisioner.provision();

    sandbox.assert.notCalled(provider.submitBids);
    sandbox.assert.notCalled(provider.rejectBids);
    sandbox.assert.notCalled(provider.proposeBids);
    sandbox.assert.notCalled(biddingStrategy.selectBids);

    sandbox.assert.calledOnce(biddingStrategy.determineDemand);
    sandbox.assert.calledWith(biddingStrategy.determineDemand.firstCall, {
      workerType: 'worker-type-1',
      biddingStrategyData: {minCapacity:0, maxCapacity:300},
    });

  });

  test('should do nothing when provider is not configured', async () =>{
    provisioner.providers.delete(provider.id);

    await provisioner.provision();

    sandbox.assert.notCalled(provider.submitBids);
    sandbox.assert.notCalled(provider.rejectBids);
    sandbox.assert.notCalled(provider.proposeBids);
    sandbox.assert.notCalled(biddingStrategy.selectBids);

    sandbox.assert.notCalled(biddingStrategy.determineDemand);
  });

  test('should do nothing when bidding strategy is not configured', async () =>{

    provisioner.biddingStrategies.delete(biddingStrategy.id);

    await provisioner.provision();

    sandbox.assert.notCalled(biddingStrategy.determineDemand);
    sandbox.assert.notCalled(provider.submitBids);
    sandbox.assert.notCalled(provider.rejectBids);
    sandbox.assert.notCalled(provider.proposeBids);
    sandbox.assert.notCalled(biddingStrategy.selectBids);
  });

  test('should receive bids from providers, reject all', async () =>{
    let bids = [
      provider.createBid({price:1, capacity:4, utilityFactor:1}),
    ];

    biddingStrategy.determineDemand
      .onFirstCall()
      .returns(1);

    provider.proposeBids
      .onFirstCall()
      .returns(bids);

    biddingStrategy.selectBids
      .onFirstCall()
      .returns({accept: [], reject: bids.map(x => x.id)});

    await provisioner.provision();

    sandbox.assert.notCalled(provider.submitBids);

    sandbox.assert.calledOnce(biddingStrategy.determineDemand);
    sandbox.assert.calledWith(biddingStrategy.determineDemand.firstCall, {
      workerType: 'worker-type-1',
      biddingStrategyData: {minCapacity:0, maxCapacity:300},
    });

    sandbox.assert.calledOnce(provider.proposeBids);
    sandbox.assert.calledWith(provider.proposeBids.firstCall, {
      workerType: 'worker-type-1',
      demand: 1,
      workerConfiguration: sandbox.match.instanceOf(WorkerConfiguration),
    });

    sandbox.assert.calledOnce(provider.rejectBids);
    sandbox.assert.calledWith(provider.rejectBids.firstCall, {
      bids: sandbox.match.every(sandbox.match.instanceOf(Bid)),
    });

    sandbox.assert.calledOnce(biddingStrategy.selectBids);
    sandbox.assert.calledWith(biddingStrategy.selectBids.firstCall, {
      workerType: 'worker-type-1',
      biddingStrategyData: {minCapacity:0, maxCapacity:300},
      bids: sandbox.match.every(sandbox.match.instanceOf(Bid)),
      demand: 1,
    });

  });

  test('should receive bids from providers, submit all', async () =>{
    let bids = [
      provider.createBid({price:1, capacity:4, utilityFactor:1}),
    ];

    biddingStrategy.determineDemand
      .onFirstCall()
      .returns(1);

    provider.proposeBids
      .onFirstCall()
      .returns(bids);

    biddingStrategy.selectBids
      .onFirstCall()
      .returns({accept: bids.map(x => x.id), reject: []});

    await provisioner.provision();

    sandbox.assert.notCalled(provider.rejectBids);

    sandbox.assert.calledOnce(biddingStrategy.determineDemand);
    sandbox.assert.calledWith(biddingStrategy.determineDemand.firstCall, {
      workerType: 'worker-type-1',
      biddingStrategyData: {minCapacity:0, maxCapacity:300},
    });

    sandbox.assert.calledOnce(provider.proposeBids);
    sandbox.assert.calledWith(provider.proposeBids.firstCall, {
      workerType: 'worker-type-1',
      demand: 1,
      workerConfiguration: sandbox.match.instanceOf(WorkerConfiguration),
    });

    sandbox.assert.calledOnce(provider.submitBids);
    sandbox.assert.calledWith(provider.submitBids.firstCall, {
      bids: sandbox.match.every(sandbox.match.instanceOf(Bid)),
    });

    sandbox.assert.calledOnce(biddingStrategy.selectBids);
    sandbox.assert.calledWith(biddingStrategy.selectBids.firstCall, {
      workerType: 'worker-type-1',
      biddingStrategyData: {minCapacity:0, maxCapacity:300},
      bids: sandbox.match.every(sandbox.match.instanceOf(Bid)),
      demand: 1,
    });
  });

  test('it should run as an iterating function', async () => {
    let bids = [
      provider.createBid({price:1, capacity:4, utilityFactor:1}),
    ];

    biddingStrategy.determineDemand
      .onFirstCall()
      .returns(1);

    provider.proposeBids
      .onFirstCall()
      .returns(bids);

    let i = 0;
    biddingStrategy.selectBids.callsFake(opts => {
      if (i++ % 2 === 0) {
        return {accept: opts.bids.map(x => x.id), reject: []};
      }
      return {accept: [], reject: opts.bids.map(x => x.id)};
    });

    await provisioner.initiate();
    await new Promise(resolve => setTimeout(resolve, 4500));
    await provisioner.terminate();
  });
});

