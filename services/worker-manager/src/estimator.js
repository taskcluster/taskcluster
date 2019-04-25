class Estimator {
  constructor({queue, provisionerId}) {
    this.queue = queue;
    this.provisionerId = provisionerId;
  }

  async simple({name, min, max, capacityPerInstance}) {
    const {pendingTasks} = await this.queue.pendingTasks(this.provisionerId, name);
    return Math.max(min, Math.min(Math.round(pendingTasks / capacityPerInstance), max));
  }
}

module.exports = {
  Estimator,
};
