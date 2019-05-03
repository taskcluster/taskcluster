class Estimator {
  constructor({queue, provisionerId, monitor}) {
    this.queue = queue;
    this.provisionerId = provisionerId;
    this.monitor = monitor;
  }

  async simple({name, minCapacity, maxCapacity, capacityPerInstance, currentSize}) {
    const {pendingTasks} = await this.queue.pendingTasks(this.provisionerId, name);

    // First we find the amount of capacity we want. This is a very simple approximation
    const desiredCapacity = Math.max(minCapacity, Math.min(pendingTasks, maxCapacity));

    const desiredSize = Math.round(desiredCapacity / capacityPerInstance);

    this.monitor.log.simpleEstimate({
      workerType: name,
      pendingTasks,
      minCapacity,
      maxCapacity,
      capacityPerInstance,
      currentSize,
      desiredSize,
    });

    // We don't ever turn off instances via the group. Instances delete themselves
    return Math.max(currentSize, desiredSize);
  }
}

module.exports = {
  Estimator,
};
