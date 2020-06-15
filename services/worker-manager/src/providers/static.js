const taskcluster = require('taskcluster-client');
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
      expires: new Date(input.expires),
      capacity: input.capacity,
      state: Worker.states.RUNNING,
      providerData: {staticSecret, workerConfig: workerPool.config.workerConfig},
    };

    let worker;
    try {
      worker = Worker.fromApi(workerData);
      await worker.create(this.db);
    } catch (err) {
      if (!err || err.code !== 'EntityAlreadyExists') {
        throw err;
      }
      const existing = await Worker.get(this.db, { workerPoolId, workerGroup, workerId });
      if (existing.providerId !== providerId || existing.providerData.staticSecret !== staticSecret) {
        throw new ApiError('worker already exists');
      }
      worker = existing;
    }

    return worker;
  }

  async removeWorker({worker, reason}) {
    this.monitor.log.workerRemoved({
      workerPoolId: worker.workerPoolId,
      providerId: worker.providerId,
      workerId: worker.workerId,
      reason,
    });

    await worker.remove();
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    const {staticSecret} = workerIdentityProof;

    // note that this can be called multiple times for the same worker..

    if (!staticSecret) {
      throw new ApiError('missing staticSecret in workerIdentityProof');
    }

    if (staticSecret !== worker.providerData.staticSecret) {
      throw new ApiError('bad staticSecret in workerIdentityProof');
    }

    let expires;
    const {reregistrationTimeout} = Provider.interpretLifecycle(workerPool.config);
    if (reregistrationTimeout) {
      expires = new Date(Date.now() + reregistrationTimeout);
    } else {
      expires = taskcluster.fromNow('96 hours');
    }
    const workerConfig = worker.providerData.workerConfig || {};
    return {
      expires,
      workerConfig,
    };
  }
}

module.exports = {
  StaticProvider,
};
