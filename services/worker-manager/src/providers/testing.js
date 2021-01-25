const taskcluster = require('taskcluster-client');
const { Provider, ApiError } = require('./provider');
const { Worker } = require('../data');

class TestingProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-testing';
    this.setupFailure = conf.providerConfig.setupFailure;
  }

  async setup() {
    if (this.setupFailure > 0) {
      this.setupFailure--;
      throw new Error('setup failure');
    }
  }

  async provision({ workerPool, workerInfo }) {
    this.monitor.notice('test-provision', { workerPoolId: workerPool.workerPoolId, workerInfo });
  }

  async deprovision({ workerPool }) {
    this.monitor.notice('test-deprovision', { workerPoolId: workerPool.workerPoolId });
  }

  async scanPrepare() {
    this.monitor.notice('scan-prepare', {});
  }

  async checkWorker({ worker }) {
    await worker.update(this.db, worker => {
      worker.providerData.checked = true;
    });
  }

  async scanCleanup() {
    this.monitor.notice('scan-cleanup', {});
  }

  async registerWorker({ worker, workerPool, workerIdentityProof }) {
    await worker.update(this.db, worker => {
      worker.state = Worker.states.RUNNING;
    });

    if (worker.providerData.failRegister) {
      throw new ApiError(worker.providerData.failRegister);
    }
    if (worker.providerData.noExpiry) {
      return {};
    }
    const workerConfig = worker.providerData.workerConfig || {};
    return {
      expires: taskcluster.fromNow('1 hour'),
      workerConfig,
    };
  }

  async createWorker({ workerPool, workerGroup, workerId, input }) {
    if (!workerPool.providerData.allowCreateWorker) {
      throw new ApiError('creating workers is not supported for testing provider');
    }

    const worker = Worker.fromApi({
      workerPoolId: workerPool.workerPoolId,
      providerId: this.providerId,
      workerGroup,
      workerId,
      expires: new Date(input.expires),
      capacity: input.capacity,
      state: Worker.states.RUNNING,
    });
    await worker.create(this.db);

    return worker;
  }

  async updateWorker({ workerPool, worker, input }) {
    if (!workerPool.providerData.allowUpdateWorker) {
      throw new ApiError('updating workers is not supported for testing provider');
    }

    await worker.update(this.db, worker => {
      worker.capacity = input.capacity;
    });

    return worker;
  }

  async removeWorker({ worker }) {
    if (!worker.providerData.allowRemoveWorker) {
      throw new ApiError('removing workers is not supported for testing provider');
    }

    await worker.update(this.db, worker => {
      worker.state = Worker.states.STOPPED;

      return worker;
    });
  }
}

module.exports = {
  TestingProvider,
};
