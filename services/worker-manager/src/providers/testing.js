const taskcluster = require('taskcluster-client');
const {Provider, ApiError} = require('./provider');
const {Worker} = require('../data');

class TestingProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-testing';
  }

  async createResources({workerPool}) {
    this.monitor.notice('create-resource', {workerPoolId: workerPool.workerPoolId});
  }

  async updateResources({workerPool}) {
    this.monitor.notice('update-resource', {workerPoolId: workerPool.workerPoolId});
  }

  async removeResources({workerPool}) {
    this.monitor.notice('remove-resource', {workerPoolId: workerPool.workerPoolId});
    if (workerPool.providerData.failRemoveResources) {
      await workerPool.modify(wp => {
        wp.providerData.failRemoveResources -= 1;
      });
      throw new Error('uhoh removing resources');
    }
  }

  async provision({workerPool, existingCapacity}) {
    this.monitor.notice('test-provision', {workerPoolId: workerPool.workerPoolId, existingCapacity});
  }

  async deprovision({workerPool}) {
    this.monitor.notice('test-deprovision', {workerPoolId: workerPool.workerPoolId});
  }

  async scanPrepare() {
    this.monitor.notice('scan-prepare', {});
  }

  async checkWorker({worker}) {
    await worker.modify(w => {
      w.providerData.checked = true;
    });
  }

  async scanCleanup() {
    this.monitor.notice('scan-cleanup', {});
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    await worker.modify(w => w.state = Worker.states.RUNNING);
    if (worker.providerData.failRegister) {
      throw new ApiError(worker.providerData.failRegister);
    }
    if (worker.providerData.noExpiry) {
      return {};
    }
    return {expires: taskcluster.fromNow('1 hour')};
  }

  async createWorker({workerPool, workerGroup, workerId, input}) {
    if (!workerPool.providerData.allowCreateWorker) {
      throw new ApiError('creating workers is not supported for testing provider');
    }

    const now = new Date();
    const worker = await this.Worker.create({
      workerPoolId: workerPool.workerPoolId,
      providerId: this.providerId,
      workerGroup,
      workerId,
      created: now,
      lastModified: now,
      lastChecked: now,
      expires: new Date(input.expires),
      capacity: input.capacity,
      state: this.Worker.states.RUNNING,
      providerData: {},
    });

    return worker;
  }

  async removeWorker({worker}) {
    if (!worker.providerData.allowRemoveWorker) {
      throw new ApiError('removing workers is not supported for testing provider');
    }

    await worker.modify(w => w.state = 'stopped');
  }
}

module.exports = {
  TestingProvider,
};
