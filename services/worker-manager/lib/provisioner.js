'use strict';

require('./shims');

const Iterate = require('taskcluster-lib-iterate');
const {WMObject, errors} = require('./base');
const {Bid} = require('./bid');
const {Provider} = require('./provider');

const {buildWorkerConfiguration} = require('./worker-config');

// We give the providers a proxied version of the worker configuration which
// ensures that when the provider evaluates a worker configuration, only the
// relevant fields are provided.  We do this because each provider needs to
// run the worker configuration itself.  We don't want to allow providers
// to use the incorrect section of the worker type configuration.
let providerDataProxyHandler = {
  get: function (target, prop, receiver) {
    if (prop === 'evaluate') {
      return function(...args) {
        let {workerType, providerData} = target.evaluate(...args);
        return {workerType, providerData};
      }.bind(target);
    } else {
      return Reflect.get(...arguments);
    }
  },
};

let bidProxyHandler = {
  get: function (target, prop, receiver) {
    if (prop === 'providerData') {
      return {};
    } else {
      return Reflect.get(...arguments);
    }
  },

};

/**
 * Run all provisioning logic (e.g. Providers and Bidding Strategies)
 */
class Provisioner extends WMObject {
  constructor({iterationGap=30, providers, biddingStrategies, datastore}) {
    super({id: 'provisioner'});
    this.providers = providers;
    this.biddingStrategies = biddingStrategies;
    this.datastore = datastore;
    this.iterationGap = iterationGap;

    this.iterate = new Iterate({
      maxFailures: 30, // We really don't want it to crash
      maxIterationTime: 300,
      watchDog: 301,
      waitTime: iterationGap,
      handler: async () => {
        await this.provision();
      },
    });
    // TODO:
    // make sure that iteration failures have a handler that's useful
  }

  /**
   * Start the Provisioner
   */
  async initiate() {
    await Promise.all([
      Array.from(this.providers.values()).map(x => x.initiate()),
      Array.from(this.biddingStrategies.values()).map(x => x.initiate()),
    ].flat());
    await new Promise(resolve => {
      this.iterate.once('started', resolve);
      this.iterate.start();
    });
  }

  /**
   * Terminate the Provisioner
   */
  async terminate() {
    await Promise.all([
      Array.from(this.providers.values()).map(x => x.terminate()),
      Array.from(this.biddingStrategies.values()).map(x => x.terminate()),
    ].flat());
    await new Promise(resolve => {
      this.iterate.once('stopped', resolve);
      this.iterate.stop();
    });
  }

  /**
   * Run a single provisioning iteration
   */
  async provision() {
    let workerConfigurationNames = await this.datastore.list('worker-configurations');
    let workerConfigurations = await Promise.all(workerConfigurationNames
      .map(async x => buildWorkerConfiguration(await this.datastore.get('worker-configurations', x))));

    let bids = await Promise.all(workerConfigurations.flatMap(workerConfiguration => {
      return workerConfiguration.workerTypes()
        .map(workerType => this.bidsForWorkerType({workerConfiguration, workerType}));
    }));
    bids = bids.flat();

    await Promise.all(Array.from(this.providers.values()).map(provider => {
      let providerBids = bids.filter(bid => bid.providerId === provider.id);
      if (providerBids.length > 0) {
        return provider.submitBids({bids: providerBids});
      }
    }));
  }

  /**
   *
   */
  async bidsForWorkerType({workerConfiguration, workerType}) {
    let biddingStrategyId = workerConfiguration.biddingStrategyIdForWorkerType(workerType);
    if (!biddingStrategyId) {
      return [];
    }

    let biddingStrategy = this.biddingStrategies.get(biddingStrategyId);
    if (!biddingStrategy) {
      return [];
    }

    // Get the list of providers which are relevant to this worker
    // configuration.  In the case that there aren't configured providers for
    // this worker type, simply return an empty list because there's no valid
    // bids we could create.
    let providers = workerConfiguration.providerIdsForWorkerType(workerType)
      .map(x => this.providers.get(x))
      .filter(x => x); // If only Array.prototype.mapFilter existed :/
    if (providers.length < 1) {
      return [];
    }

    // Determine the number of pending and running capacity units
    let runningCapacity = 0;
    let pendingCapacity = 0;
    for (let provider of providers) {
      let workers = await provider.listWorkers({
        states: [Provider.requested, Provider.booting, Provider.running],
        workerTypes: [workerType],
      });

      for (let worker of workers) {
        if (worker.state === Provider.running) {
          runningCapacity += worker.capacity;
        } else {
          pendingCapacity += worker.capacity;
        }
      }
    }

    // We only want to pass bidding strategy data to bidding strategies.  This
    // is to ensure that bidding strategy data is the only input to bidding
    // strategy decisions.  We will ensure that the basic structure of a worker
    // configuration evaluation is taken into account, by deleting data from
    // the return value which must not be considered by a bidding strategy
    let {biddingStrategyData} = workerConfiguration.evaluate({workerType, biddingStrategyId});
    let demand = await biddingStrategy.determineDemand(
      {workerType, biddingStrategyData},
      runningCapacity,
      pendingCapacity,
    );

    // The taskcluster worker contract is that the workers must shut themselves
    // down.  Any code in the worker manager which 'removes' capacity must be
    // limited to only dealing with exceptional cases, like a long lived
    // instance which needs to be forced off because it has frozen
    //
    // The complexities in adding termination of instances *safely* to the
    // worker contract should not be underestimated.  Any change to this must
    // have an RFC.
    if (demand < 1) {
      return [];
    }

    // Ask each provider for bids.  The workerConfiguration passed is proxied
    // through a handler which removes all of the *Data fields from the
    // evaluation result other than providerData.  This is done to ensure that
    // providers cannot consider non-provider data in their decisions.
    let bids = await Promise.all(providers.map(provider => {
      return provider.proposeBids({
        workerType,
        workerConfiguration: new Proxy(workerConfiguration, providerDataProxyHandler),
        demand
      });
    }));
    bids = bids.flat();

    // We'll map the bids between their id and their true value so that we can
    // send a stripped down copy of the bid to the bidding strategy which does
    // not included any *Data key other than biddingStrategyData.  We do this
    // to ensure that bidding strategies only consider relevant parts, and do
    // not begin to consider provider specific data.  As well, it ensures that
    // bidding strategies do not tamper with bids.
    let bidMap = new Map(bids.map(x => [x.id, x]));
    let censoredBids = bids.map(x => new Proxy(x, bidProxyHandler));

    // Ask bidding strategy to determine which bids to accept and which to
    // reject.  The biddingStrategyData is passed again to obviate the need for
    // maintaining state for it.
    let {accept, reject} = await biddingStrategy.selectBids({
      workerType,
      biddingStrategyData,
      bids: censoredBids,
      demand
    });

    // Reject the bids we don't care about as soon as we can.  Since bid
    // rejection is designed for providers which manage smaller, constrained
    // pools, we want to release the bids as soon as we know they're unneeded
    await Promise.all(providers.map(provider => {
      if (reject.length > 0) {
        return provider.rejectBids({
          bids: reject
            .filter(x => x.providerId === provider.id)
            .map(x => bidMap.get(x)),
        });
      }
    }));
    return accept.map(x => bidMap.get(x));
  }
}

module.exports = {
  Provisioner,
};

