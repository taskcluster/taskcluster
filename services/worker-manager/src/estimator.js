const {splitWorkerPoolId} = require('./util');

class Estimator {
  constructor({queue, monitor}) {
    this.queue = queue;
    this.monitor = monitor;
  }

  async simple({workerPoolId, minCapacity, maxCapacity, runningCapacity}) {
    const {provisionerId, workerType} = splitWorkerPoolId(workerPoolId);
    const {pendingTasks} = await this.queue.pendingTasks(provisionerId, workerType);

    // First we find the amount of capacity we want. This is a very simple approximation
    // We add runningCapacity here to make the min/max stuff work and then remove it to
    // decide how much more to request. In other words, we will ask to spawn
    // enough capacity to cover all pending tasks at any time unless it would
    // create more than maxCapacity instances
    const desiredCapacity = Math.max(minCapacity, Math.min(pendingTasks + runningCapacity, maxCapacity));

    // Workers turn themselves off so we just return a positive number for
    // how many extra we want if we do want any
    const requestedCapacity = Math.max(0, desiredCapacity - runningCapacity);

    const estimatorInfo = {
      workerPoolId,
      pendingTasks,
      minCapacity,
      maxCapacity,
      runningCapacity,
      desiredCapacity,
      requestedCapacity,
    }

    let overProvisioned = false;
    if (runningCapacity > (maxCapacity * 1.25)) {
      overProvisioned = true;
    }

    this.monitor.log.simpleEstimate(estimatorInfo, {level: overProvisioned ? 'err' : 'notice'});

    if (overProvisioned) {
      this.monitor.reportError(new Error('Running capacity (pending and running) is much greater than max capacity'), estimatorInfo);
    }

    return requestedCapacity;
  }
}

module.exports = {
  Estimator,
};
