const {splitWorkerPoolId} = require('./util');

class Estimator {
  constructor({queue, monitor}) {
    this.queue = queue;
    this.monitor = monitor;
  }

  async simple({workerPoolId, minCapacity, maxCapacity, existingCapacity}) {
    const {provisionerId, workerType} = splitWorkerPoolId(workerPoolId);
    const {pendingTasks} = await this.queue.pendingTasks(provisionerId, workerType);

    // First we find the amount of capacity we want. This is a very simple approximation
    // We add existingCapacity here to make the min/max stuff work and then remove it to
    // decide how much more to request. In other words, we will ask to spawn
    // enough capacity to cover all pending tasks at any time unless it would
    // create more than maxCapacity instances
    const desiredCapacity = Math.max(minCapacity, Math.min(pendingTasks + existingCapacity, maxCapacity));

    // Workers turn themselves off so we just return a positive number for
    // how many extra we want if we do want any
    const requestedCapacity = Math.max(0, desiredCapacity - existingCapacity);

    const estimatorInfo = {
      workerPoolId,
      pendingTasks,
      minCapacity,
      maxCapacity,
      existingCapacity,
      desiredCapacity,
      requestedCapacity,
    };

    // This 1.25 factor is picked arbitrarily. Ideally this never triggers unless
    // we have some bug in the providers (which is somewhat likely especially with
    // new implementations)
    let overProvisioned = false;
    if (existingCapacity > (maxCapacity * 1.25)) {
      overProvisioned = true;
    }

    this.monitor.log.simpleEstimate(estimatorInfo, {level: overProvisioned ? 'err' : 'notice'});

    if (overProvisioned) {
      this.monitor.reportError(new Error('Estimated existing capacity (pending and running) is much greater than max capacity'), estimatorInfo);
    }

    return requestedCapacity;
  }
}

module.exports = {
  Estimator,
};
