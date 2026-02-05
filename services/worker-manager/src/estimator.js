export class Estimator {
  constructor({ queue, monitor }) {
    this.queue = queue;
    this.monitor = monitor;
  }

  async simple({
    workerPoolId,
    providerId,
    minCapacity,
    maxCapacity,
    scalingRatio = 1.0,
    workerInfo: { existingCapacity = 0, stoppingCapacity = 0, requestedCapacity = 0 },
    workerInfoByWorkerGroup = new Map(),
  }) {
    const { pendingTasks, claimedTasks } = await this.queue.taskQueueCounts(workerPoolId);

    // if data is stale we might have more claimed tasks than existing capacity
    const totalIdleCapacity = Math.max(0, existingCapacity - claimedTasks);

    // we assume that idle workers are going to pick up tasks soon
    const adjustedPendingTasks = Math.max(0, pendingTasks - totalIdleCapacity);

    // Due to the fact that workers could fail to start on azure, deprovisioning will take significant amount of time
    // and on the next provision loop, those workers wouldn't be considered as requested or existing capacity
    // so worker manager would try to provision for this pool again
    // workers in stopping state would keep growing, and deprovisioning takes many calls, even though it wasn't created
    // to avoid this situation we would take into account stopping capacity and don't allow worker pool
    // to have existing + stopping capacity > max capacity to prevent affected pool start extra instances
    const totalNonStopped = existingCapacity + stoppingCapacity;

    // First we find the amount of capacity we want. This is a very simple approximation
    // We add totalNonStopped here to represent existing workers and subtract it later.
    // We scale up based on the scaling ratio and number of pending tasks.
    // We ask to spawn as much capacity as the scaling ratio dictates to cover all
    // pending tasks at any time unless it would create more than maxCapacity instances
    const desiredCapacity = Math.max(
      minCapacity,
      // only scale as high as maxCapacity
      Math.min(adjustedPendingTasks * scalingRatio + totalNonStopped, maxCapacity),
    );
    const estimatorInfo = {
      workerPoolId,
      pendingTasks,
      minCapacity,
      maxCapacity,
      totalIdleCapacity,
      adjustedPendingTasks,
      scalingRatio,
      existingCapacity,
      desiredCapacity,
      requestedCapacity,
      stoppingCapacity,
    };

    // This 1.25 factor is picked arbitrarily. Ideally this never triggers unless
    // we have some bug in the providers (which is somewhat likely especially with
    // new implementations)
    // We also pick existingCapacity > 25 as a lower threshold to avoid throwing this
    // when a small pool has worker configs that have more capacity than the max
    // e.g. a maxCapacity of 2 with a config that has capacity 12
    // Eventually we can disallow this condition but we allowed it at first so
    // we have to live with it for a bit.
    let overProvisioned = false;
    if (existingCapacity > 25 && existingCapacity > (maxCapacity * 1.25)) {
      overProvisioned = true;
    }

    this.monitor.log.simpleEstimate(estimatorInfo, { level: overProvisioned ? 'err' : 'notice' });

    if (overProvisioned) {
      this.monitor.reportError(new Error('Estimated existing capacity (pending and running) is much greater than max capacity'), estimatorInfo);
    }

    // Workers turn themselves off so we just return a positive number for
    // how many extra we want if we do want any
    const toSpawn = Math.max(0, desiredCapacity - totalNonStopped);

    this.exposeMetrics({
      workerPoolId,
      providerId,
      existingCapacity,
      stoppingCapacity,
      requestedCapacity,
      desiredCapacity,
      totalIdleCapacity,
      adjustedPendingTasks,
      pendingTasks,
      claimedTasks,
      workerInfoByWorkerGroup,
    });

    // subtract the instances that are starting up from that number to spawn
    // if the value is <= 0, than we don't need to spawn any new instance
    return Math.max(toSpawn - requestedCapacity, 0);
  }

  /**
   * Expose all metrics for provisioning
   * @param {{
   *    workerPoolId: string, providerId: string,
   *    existingCapacity: number, stoppingCapacity: number, requestedCapacity: number,
   *    desiredCapacity: number, totalIdleCapacity: number, adjustedPendingTasks: number,
   *    pendingTasks: number, claimedTasks: number,
   *    workerInfoByWorkerGroup: Map<string, {
   *        existingCapacity: number, stoppingCapacity: number, requestedCapacity: number }>,
   *  }} metrics
   */
  exposeMetrics({
    workerPoolId,
    providerId,
    existingCapacity,
    stoppingCapacity,
    requestedCapacity,
    desiredCapacity,
    totalIdleCapacity,
    adjustedPendingTasks,
    pendingTasks,
    claimedTasks,
    workerInfoByWorkerGroup,
  }) {
    const poolLabels = { workerPoolId, providerId };

    this.monitor.metric.desiredCapacity(desiredCapacity, poolLabels);
    this.monitor.metric.totalIdleCapacity(totalIdleCapacity, poolLabels);
    this.monitor.metric.adjustedPendingTasks(adjustedPendingTasks, poolLabels);
    this.monitor.metric.pendingTasks(pendingTasks, poolLabels);
    this.monitor.metric.claimedTasks(claimedTasks, poolLabels);

    if (workerInfoByWorkerGroup.size > 0) {
      for (const [workerGroup, info] of workerInfoByWorkerGroup) {
        const labels = { workerPoolId, providerId, workerGroup };
        this.monitor.metric.existingCapacity(info.existingCapacity, labels);
        this.monitor.metric.stoppingCapacity(info.stoppingCapacity, labels);
        this.monitor.metric.requestedCapacity(info.requestedCapacity, labels);
      }
    } else {
      this.monitor.metric.existingCapacity(existingCapacity, poolLabels);
      this.monitor.metric.stoppingCapacity(stoppingCapacity, poolLabels);
      this.monitor.metric.requestedCapacity(requestedCapacity, poolLabels);
    }
  }
}
