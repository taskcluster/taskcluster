'use strict';

const {Bid} = require('../bid');
const {Provider} = require('../provider');
const Worker = require('../worker');
const Compute = require('@google-cloud/compute');

class GCPProvider extends Provider {

  /**
   * Construct a GCP Provider
   */
  constructor({id}) {
    super({id});
    this.gcpCompute = new Compute();
  }

  convertToGCPStatus(taskclusterWorkerState) {
    switch (taskclusterWorkerState) {
      case Provider.states.booting: return ['STAGING'];
      case Provider.states.requested: return ['PROVISIONING'];
      case Provider.states.running: return ['RUNNING'];
      case Provider.states.terminating: return ['STOPPING', 'SUSPENDING', 'SUSPENDED', 'TERMINATED'];
    }
  }

  convertFromGCPStatus(gcpInstanceStatus) {
    switch (gcpInstanceStatus) {
      case 'PROVISIONING': return Provider.states.requested;
      case 'STAGING': return Provider.states.requested;
      case 'RUNNING': return Provider.states.running;
      case 'STOPPING': return Provider.states.terminating;
      case 'SUSPENDING': return Provider.states.terminating;
      case 'SUSPENDED': return Provider.states.terminating;
      case 'TERMINATED': return Provider.states.terminating;
    }
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

    let filter = workerTypes.map(wt => `(labels.worker-type = ${wt})`).join(' OR ');

    const instances = (await this.gcpCompute.getVMs({
      autoPaginate: false,
      filter,
    }))[0]
      .filter(i => states.includes(this.convertFromGCPStatus(i.metadata.status)));

    return instances.map(i => new Worker({
      id: i.id, // i.id same as i.name (must be unique); i.metadata.id is numerical id of the instance
      group: i.zone.id,
      workerType: i.metadata.labels['worker-type'],
      state: this.convertFromGCPStatus(i.metadata.status),
      capacity: 1,
      workerConfigurationId: i.metadata.labels['worker-configuration-id'],
      providerData: {}, // todo I am not sure what provider data is supposed to be
    }));
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
