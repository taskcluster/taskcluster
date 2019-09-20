const {splitWorkerPoolId} = require('./util');

class Estimator {
  constructor({queue, monitor}) {
    this.queue = queue;
    this.monitor = monitor;
  }

  /**
   * This calculates the desired extra capacity at any given time. It does not
   * calculate how many workers you want. You'll probably want to divide by the capacity
   * each instance provides for this.
   */
  async simple({workerPoolId, minCapacity, maxCapacity, runningCapacity, pendingCapacity}) {
    const {provisionerId, workerType} = splitWorkerPoolId(workerPoolId);
    const {pendingTasks} = await this.queue.pendingTasks(provisionerId, workerType);

    // First we find the amount of capacity we want. This is a very simple approximation
    // You'll notice that we add runningCapacity and then immediately subtract it
    // in the next line but it is added in to make logging make sense and for its
    // interactions with Math.max and Math.min
    const desiredCapacity = Math.max(minCapacity, Math.min(pendingTasks + runningCapacity, maxCapacity));

    // Workers turn themselves off so we just return a positive number for
    // how many extra we want if we do want any
    const requestingCapacity = Math.max(0, desiredCapacity - pendingCapacity - runningCapacity);

    this.monitor.log.simpleEstimate({
      workerPoolId,
      pendingTasks,
      minCapacity,
      maxCapacity,
      runningCapacity,
      pendingCapacity,
      desiredCapacity,
      requestingCapacity,
    });

    return requestingCapacity;
  }
}

module.exports = {
  Estimator,
};
