'use strict';

const {Bid} = require('../bid');
const {Provider} = require('../provider');

class GCPProvider extends Provider {

  /**
   * Construct a GCP Provider
   */
  constructor({id}) {
    super({id});
  }

  async listWorkers({states, workerTypes}) {
    console.log(`Got states: ${states}, and worker types: ${workerTypes}`);
    return [];
  }

  async queryWorkerState({workerId}) {
    console.log(`Got worker id: ${workerId}`);
    return 'This should be a string';
  }

  /**
   * I'm not sure why this isn't async
   * @param worker
   */
  workerInfo({worker}) {
    console.log(`Got worker: ${worker}`);
    return {};
  }

  async initiate() {
    console.log('😳');
  }

  async terminate() {
    console.log('😷')
  }

  async async proposeBids({workerType, workerConfiguration, demand}) {
    console.log(`Got worker type: ${workerType}, worker config: ${workerConfiguration}, demand: ${demand}`);
    return [
      new Bid({
        providerId,
        workerType,
        workerConfigurationId,
        expires,
        price,
        capacity,
        utilityFactor,
        firm,
        reliability,
        estimatedDelay,
        providerData
      }),
    ];
  }

  /**
   *
   * @param bids
   * @returns nothing
   */
  async submitBids({bids}) {
    console.log(`Got bids: ${bids}. Submitting...`);
  }

  /**
   *
   * @param bids
   * @returns nothing
   */
  async rejectBids({bids}) {
    console.log(`Got bids: ${bids}. Rejecting...`);
  }

  /**
   * This method must not return until the request to terminate all workers is completed.
   * @returns {Promise<void>}
   */
  async terminateAllWorkers() {
    console.log(`Terminating workers... Please hold`);
    return;
  }

  /**
   *
   * @param workerType
   * @returns {Promise<void>}
   */
  async terminateWorkerType({workerType}) {
    console.log(`Got worker type: ${workerType}. Terminating`);
  }

  /**
   *
   * @param workers
   * @returns {Promise<void>}
   */
  async terminateWorkers({workers}) {
    console.log(`Got workers: ${workers}. Terminating...`);
  }

}