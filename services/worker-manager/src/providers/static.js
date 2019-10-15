const {ApiError, Provider} = require('./provider');
const {Worker} = require('../data');

class StaticProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-static';
  }

  async createWorker({workerPool, workerGroup, workerId, input}) {
    const {staticSecret} = input.providerInfo || {};
    if (!staticSecret) {
      throw new ApiError('no worker staticSecret provided');
    }

    const {workerPoolId, providerId} = workerPool;
    const workerData = {
      workerPoolId,
      workerGroup,
      workerId,
      providerId,
      created: new Date(),
      expires: new Date(input.expires),
      state: Worker.states.RUNNING,
      providerData: {staticSecret},
    };

    let worker;
    try {
      worker = await this.Worker.create(workerData);
    } catch (err) {
      if (!err || err.code !== 'EntityAlreadyExists') {
        throw err;
      }
      const existing = await this.Worker.load({workerPoolId, workerGroup, workerId}, true);
      if (existing.providerId !== providerId || existing.providerData.staticSecret !== staticSecret) {
        throw new ApiError('worker already exists');
      }
      worker = existing;
    }

    return worker;
  }

  async removeWorker({worker}) {
    await worker.remove();
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    const {staticSecret} = workerIdentityProof;

    // note that this can be called multiple times for the same worker..

    if (!worker.providerData.staticSecret || staticSecret !== worker.providerData.staticSecret) {
      throw new ApiError('bad staticSecret');
    }

    return {expires: worker.expires};
  }
}

module.exports = {
  StaticProvider,
};
