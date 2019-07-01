const taskcluster = require('taskcluster-client');
const {Provider} = require('./provider');
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
  }

  async provision({workerPool}) {
    this.monitor.notice('test-provision', {workerPoolId: workerPool.workerPoolId});
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
      return {errorMessage: worker.providerData.failRegister};
    }
    if (worker.providerData.noExpiry) {
      return {};
    }
    return {expires: taskcluster.fromNow('1 hour')};
  }
}

module.exports = {
  TestingProvider,
};
