export class Estimator {
  constructor({ queue, monitor }) {
    this.queue = queue;
    this.monitor = monitor;
  }

  async simple({ workerPoolId, minCapacity, maxCapacity, scalingRatio = 1.0, workerInfo }) {
    const { pendingTasks } = await this.queue.pendingTasks(workerPoolId);
    const { existingCapacity, stoppingCapacity = 0, requestedCapacity = 0 } = workerInfo;

    // First we find the amount of capacity we want. This is a very simple approximation
    // We add existingCapacity here to represent existing workers and subtract it later.
    // We scale up based on the scaling ratio and number of pending tasks.
    // We ask to spawn as much capacity as the scaling ratio dictates to cover all
    // pending tasks at any time unless it would create more than maxCapacity instances
    const desiredCapacity = Math.max(
      minCapacity,
      // only scale as high as maxCapacity
      Math.min(pendingTasks * scalingRatio + existingCapacity, maxCapacity),
    );
    const estimatorInfo = {
      workerPoolId,
      pendingTasks,
      minCapacity,
      maxCapacity,
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

    // due to the fact that workers could fail to start on azure, deprovisioning will take significant amount of time
    // and on the next provision loop, those workers wouldn't be considered as requested or existing capacity
    // so worker manager would try to provision for this pool again
    // workers in stopping state would keep growing, and deprovisioning takes many calls, even though it wasn't created
    // to avoid this situation we would take into account stopping capacity and don't allow worker pool
    // to have existing + stopping capacity > max capacity to prevent affected pool start extra instances
    const totalNonStopped = existingCapacity + stoppingCapacity;

    // Workers turn themselves off so we just return a positive number for
    // how many extra we want if we do want any
    const toSpawn = Math.max(0, desiredCapacity - totalNonStopped);

    // subtract the instances that are starting up from that number to spawn
    // if the value is <= 0, than we don't need to spawn any new instance
    return Math.max(toSpawn - requestedCapacity, 0);
  }
}
