import process from 'process';
import Iterate from 'taskcluster-lib-iterate';
import { paginatedIterator } from 'taskcluster-lib-postgres';
import { WorkerPool, Worker, WorkerPoolStats } from './data.js';
import { ApiError } from './providers/provider.js';
import { measureTime } from './util.js';
import { fromNow } from 'taskcluster-client';

/**
 * Run all provisioning logic
 */
export class Provisioner {
  /**
   * @param {object} options
   * @param {import('./providers/index.js').Providers} options.providers
   * @param {object} options.iterateConf
   * @param {Worker} options.Worker
   * @param {WorkerPool} options.WorkerPool
   * @param {object&{alert: Function}} options.monitor
   * @param {object} options.notify
   * @param {import('taskcluster-lib-postgres').Database} options.db
   * @param {string} options.ownName
   */
  constructor({ providers, iterateConf, Worker, WorkerPool, monitor, notify, db, ownName }) {
    this.providers = providers;
    this.WorkerPool = WorkerPool;
    this.Worker = Worker;
    this.monitor = monitor;
    this.notify = notify;
    this.db = db;

    // lib-iterate will have loops stand on top of each other
    // so we will explicitly grab a mutex in each loop to ensure
    // we're the only one going at any given time
    this.provisioningLoopAlive = false;

    this.iterate = new Iterate({
      maxFailures: 10,
      watchdogTime: 0,
      waitTime: 10000,
      maxIterationTime: 300000, // We really should be making it through the list at least once every 5 minutes
      ...iterateConf,
      name: ownName,
      handler: async () => {
        await this.provision();
      },
      monitor,
    });
    this.iterate.on('error', () => {
      this.monitor.alert('iteration failed repeatedly; terminating process');
      process.exit(1);
    });
  }

  /**
   * Start the Provisioner
   */
  async initiate() {
    await this.providers.forAll(p => p.initiate());
    await this.iterate.start();
  }

  /**
   * Terminate the Provisioner
   */
  async terminate() {
    await this.iterate.stop();
    await this.providers.forAll(p => p.terminate());
  }

  /**
   * Run a single provisioning iteration
   */
  async provision() {
    if (this.provisioningLoopAlive) {
      this.monitor.alert('loop-interference', {});
      // should be treated as terminal error
      // to let the pod to restart and avoid getting stuck in a loop
      throw new ApiError('provision loop interference');
    }
    try {
      this.provisioningLoopAlive = true;
      // Any once-per-loop work a provider may want to do
      await this.providers.forAll(p => p.prepare());

      await this.#provisionLoop();

      // Now allow providers to do whatever per-loop cleanup they may need
      await this.providers.forAll(p => p.cleanup());
    } finally {
      this.provisioningLoopAlive = false; // Allow lib-iterate to start a loop again
    }
  }

  /**
   * @param {string} workerPoolId
   */
  async #scanWorkersInPool(workerPoolId) {
    /**
     * @param {number} size
     * @param {number|Map<string, unknown>|null} offset
     */
    const fetch = async (size, offset) =>
      await this.db.fns.get_non_stopped_workers_with_launch_config_scanner(
        workerPoolId, null, null, null, null, size, offset,
      );

    const stats = new WorkerPoolStats(workerPoolId);
    for await (let row of paginatedIterator({ fetch })) {
      const worker = Worker.fromDb(row);
      // track the providerIds seen for each worker pool, so they can be removed
      // from the list of previous provider IDs
      stats.providers.add(worker.providerId);
      stats.updateFromWorker(worker);
    }

    // add information about errors in the past 60 minutes
    const lastHour = fromNow('-1 hour');
    const errorsByLc = await this.db.fns.get_worker_pool_error_launch_configs(workerPoolId, lastHour);
    for (let row of errorsByLc) {
      stats.totalErrors += row.count;
      stats.errorsByLaunchConfig.set(row.launch_config_id, row.count);
    }

    return stats;
  }

  async #provisionLoop() {
    // For each worker pool we ask the providers to do stuff
    const workerPools = (await this.db.fns.get_worker_pools_with_launch_configs(null, null))
      .map(row => WorkerPool.fromDb(row));

    for (const workerPool of workerPools) {
      const elapsedTime = measureTime(1e9);
      const { providerId, previousProviderIds, workerPoolId } = workerPool;

      const provider = this.providers.get(providerId);
      if (!provider) {
        this.monitor.warning(
          `Worker pool ${workerPool.workerPoolId} has unknown providerId ${workerPool.providerId}`);
        continue;
      } else if (provider.setupFailed) {
        // ignore provisioning for providers that have not been setup correctly
        continue;
      }

      const wpStats = await this.#scanWorkersInPool(workerPoolId); // populate workerPoolsStats

      try {
        await provider.provision({ workerPool, workerPoolStats: wpStats });
      } catch (err) {
        this.monitor.reportError(err,
          {
            providerId: workerPool.providerId,
            type: 'provisioning-failed',
          },
        ); // Just report this and move on
      }

      await Promise.all(previousProviderIds.map(async pId => {
        const provider = this.providers.get(pId);
        if (!provider) {
          this.monitor.info(
            `Worker pool ${workerPool.workerPoolId} has unknown previousProviderIds entry ${pId} (ignoring)`);
          return;
        } else if (provider.setupFailed) {
          // if setup failed for this previous provider, then it will remain in the list of previous
          // providers for this pool until it is up and running again, so we can skip this iteration.
          return;
        }

        try {
          await provider.deprovision({ workerPool });
        } catch (err) {
          this.monitor.reportError(err, { providerId: pId }); // Just report this and move on
        }

        // Now if this provider is no longer a provider for any workers that exist
        // in this pool, remove it from the previous providers list
        if (!wpStats.providers.has(pId)) {
          await this.db.fns.remove_worker_pool_previous_provider_id(workerPoolId, pId);
        }
      }));

      this.monitor.log.workerPoolProvisioned({
        workerPoolId: workerPool.workerPoolId,
        providerId: workerPool.providerId,
        duration: elapsedTime(),
      });
    }
  }
}
