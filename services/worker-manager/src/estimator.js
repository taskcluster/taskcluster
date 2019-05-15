class Estimator {
  constructor({queue, provisionerId, monitor}) {
    this.queue = queue;
    this.provisionerId = provisionerId;
    this.monitor = monitor;
  }

  async simple({name, minCapacity, maxCapacity, capacityPerInstance, running}) {
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
      running,
      desiredSize,
    });

    // Workers turn themselves off so we just return a positive number for
    // how many extra we want if we do want any
    return Math.max(0, desiredSize - running);
  }
}

module.exports = {
  Estimator,
};
