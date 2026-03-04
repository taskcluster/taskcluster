import taskcluster from '@taskcluster/client';
import { ApiError, Provider } from './provider.js';
import { Worker } from '../data.js';

export class StaticProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-static';
  }

  async createWorker({ workerPool, workerGroup, workerId, input }) {
    const { staticSecret } = input.providerInfo || {};
    if (!staticSecret) {
      throw new ApiError('no worker staticSecret provided');
    }

    const { workerPoolId, providerId } = workerPool;
    const workerData = {
      workerPoolId,
      workerGroup,
      workerId,
      providerId,
      expires: new Date(input.expires),
      capacity: input.capacity,
      state: Worker.states.RUNNING,
      providerData: { staticSecret },
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

  async updateWorker({ workerPool, worker, input }) {
    await worker.update(this.db, worker => {
      worker.expires = input.expires;
      worker.capacity = input.capacity;
      worker.providerData = {
        ...worker.providerData,
        staticSecret: input.providerInfo.staticSecret,
      };
    });
    return worker;
  }

  async removeWorker({ worker, reason }) {
    const created = worker.created?.getTime?.();
    const lifecycle = Provider.getWorkerManagerData(worker);
    const registeredAt = Provider.timestampToMs(lifecycle?.registeredAt);
    const now = Date.now();
    this.monitor.log.workerRemoved({
      workerPoolId: worker.workerPoolId,
      providerId: worker.providerId,
      workerId: worker.workerId,
      reason,
      workerAge: Number.isFinite(created) ? (now - created) / 1000 : null,
      runningDuration: Number.isFinite(registeredAt) ? (now - registeredAt) / 1000 : null,
    });

    await worker.update(this.db, worker => {
      worker.state = Worker.states.STOPPED;
    });
  }

  async registerWorker({ worker, workerPool, workerIdentityProof }) {
    const { staticSecret } = workerIdentityProof;

    // note that this can be called multiple times for the same worker..

    if (worker.state !== Worker.states.RUNNING) {
      throw new ApiError('worker is not running');
    }

    if (!staticSecret) {
      throw new ApiError('missing staticSecret in workerIdentityProof');
    }

    if (staticSecret !== worker.providerData.staticSecret) {
      throw new ApiError('bad staticSecret in workerIdentityProof');
    }

    let expires;
    const { reregistrationTimeout } = Provider.interpretLifecycle(workerPool.config);
    if (reregistrationTimeout) {
      expires = new Date(Date.now() + reregistrationTimeout);
    } else {
      expires = taskcluster.fromNow('96 hours');
    }
    const workerConfig = workerPool.config.workerConfig || {};
    return {
      expires,
      workerConfig,
    };
  }
}
