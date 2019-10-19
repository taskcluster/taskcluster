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
    const desiredCapacity = Math.max(minCapacity, Math.min(pendingTasks, maxCapacity));

    // Workers turn themselves off so we just return a positive number for
    // how many extra we want if we do want any
    const requestedCapacity = Math.max(0, desiredCapacity - runningCapacity);

    this.monitor.log.simpleEstimate({
      workerPoolId,
      pendingTasks,
      minCapacity,
      maxCapacity,
      runningCapacity,
      desiredCapacity,
      requestedCapacity,
    });

    return requestedCapacity;
  }
}

module.exports = {
  Estimator,
};
