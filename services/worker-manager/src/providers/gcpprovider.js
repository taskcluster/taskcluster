'use strict';

const {Bid} = require('../bid');
const {Provider} = require('../provider');
const {Worker} = require('../worker');

class GCPProvider extends Provider {

  /**
   * Construct a GCP Provider
   */
  constructor({id}) {
    super({id});
  }

  /**
   * this is called in provisioner
   *
   * @param states Array<String>
   * @param workerTypes Array<String>
   * @returns {Promise<Array<Worker>>}
   */
  async listWorkers({states, workerTypes}) {
    console.log(`Got states: ${states}, and worker types: ${workerTypes}`);

    const workersInAllStates = workerTypes.flatMap(wt => {
      let gcpInfo = gcp.getWrokersOfType(wt); // pseudocode start
      // this whole part may actually be wrong....maybe we don't map over gcpInfo.....capacity is just .length of smth
      // also, I see the potential to use this.queryWorkerState and this.workerInfo here
      return gcpInfo.map(i => new Worker({
        id: i.id,
        group: i.group,
        workerType: i.workerType,
        state: i.state,
        capacity: i.capacity,
        workerConfigurationId: i.workerConfigurationId, // ???
        providerData: i.fluff, // pseudocode end
      }));
    });

    const workersInNeededStates = workersInAllStates.filter(
      wt => states.includes(wt.state)
    );

    return workersInNeededStates;
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
    console.log('😷');
  }

  /**
   * This is called in provisioner
   *
   * @param workerType String
   * @param workerConfiguration Proxy<WorkerConfiguration>
   * @param demand Number
   * @returns {Promise<Array<Bid>>}
   */
  async proposeBids({workerType, workerConfiguration, demand}) {
    console.log(`Got worker type: ${workerType}, worker config: ${JSON.stringify(workerConfiguration, null, 2)}, demand: ${demand}`);

    const expires = new Date();
    expires.setDate(expires.getDate() + 1);

    // get list of available workers from gcp

    //

    return [
      new Bid({
        providerId: this.id,
        workerType: '',
        workerConfigurationId: workerConfiguration.id,
        expires,
        price: 1, // for now hardcode
        capacity: 2, // divisor for price
        utilityFactor: 3, // some multiplier, not sure where would come from
        firm: false, // true if it's smth like EC2 Reserved Instance
        reliability: 1, // some number ???
        estimatedDelay: 1, // this can be some static value
      }),
    ];
  }

  /**
   * This is called in the provisioner
   *
   * @param Array<Bid> (accepted bids for this provider)
   * @returns void
   */
  async submitBids({bids}) {
    console.log(`Got bids: ${bids}. Submitting...`);
  }

  /**
   * This is called in provisioner. Actually seems to be optional to implement
   *
   * @param bids Array<Bid> (all the bids are for this provider)
   * @returns void
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

module.exports = {
  GCPProvider,
};
