const {Provider} = require('./provider');

class GoogleProvider extends Provider {

  constructor({id, monitor}) {
    super({id, monitor});
  }

  async initiate() {
  }

  async terminate() {
  }

  async listWorkers({states, workerTypes}) {
    throw new Error('Method Unimplemented!');
  }

  async queryWorkerState({workerId}) {
    throw new Error('Method Unimplemented!');
  }

  workerInfo({worker}) {
    throw new Error('Method Unimplemented!');
  }

  async prepare() {
    // TODO: I don't think there's anyhting to do here
  }

  async provision({workerType}) {
  }

  async cleanup() {
    // Here we will list all templates that this provider has created
    // and remove any that weren't called in the provisioning loop
  }

  async terminateAllWorkers() {
    throw new Error('Method Unimplemented!');
  }

  async terminateWorkerType({workerType}) {
    throw new Error('Method Unimplemented!');
  }

  async terminateWorkers({workers}) {
    throw new Error('Method Unimplemented!');
  }

}

module.exports = {
  GoogleProvider,
};
