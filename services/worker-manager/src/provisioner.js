const process = require('process');
const Iterate = require('taskcluster-lib-iterate');
const { paginatedIterator } = require('taskcluster-lib-postgres');
const { WorkerPool, Worker } = require('./data');
const { ApiError } = require('./providers/provider');

/**
 * Run all provisioning logic
 */
class Provisioner {
  constructor({ providers, iterateConf, Worker, WorkerPool,
    monitor, notify, db, reference,
    rootUrl, ownName }) {
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
    if (this.pq) {
      // TODO: is it defined anywhere at all?
      await this.pq.stop();
      this.pq = null;
    }
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

      // track the providerIds seen for each worker pool, so they can be removed
      // from the list of previous provider IDs
      const providersByPool = new Map();
      const seen = worker => {
        // don't count capacity for stopping workers
        if (worker.state === Worker.states.STOPPING) {
          return;
        }

        // compute the number of instances that have not yet called "registerWorker"
        const isRequested = worker.state === Worker.states.REQUESTED;
        const requestedCapacity = isRequested ? worker.capacity : 0;

        // check for quarantined workers and do not consider them in the existing
        // capacity
        const isQuarantined = worker.quarantineUntil && worker.quarantineUntil > new Date();
        const existingCapacity = isQuarantined ? 0 : worker.capacity;

        let v = providersByPool.get(worker.workerPoolId);
        if (!v) {
          v = {
            providers: new Set([]),
            existingCapacity: 0,
            requestedCapacity: 0,
          };
          providersByPool.set(worker.workerPoolId, v);
        }

        v.providers.add(worker.providerId);
        v.existingCapacity += existingCapacity;
        v.requestedCapacity += requestedCapacity;
      };

      // Check the state of workers (state is updated by worker-scanner)
      const fetch =
        async (size, offset) => await this.db.fns.get_non_stopped_workers_quntil_providers(
          null, null, null, null, null, size, offset);
      for await (let row of paginatedIterator({ fetch })) {
        const worker = Worker.fromDb(row);
        seen(worker);
      }

      // We keep track of which providers are actively managing
      // each workerpool so that the provider can update the
      // pool even if 0 non-STOPPED instances of the worker
      // currently exist
      const poolsByProvider = new Map();

      // Now for each worker pool we ask the providers to do stuff
      const workerPools = (await this.db.fns.get_worker_pools_with_capacity_and_counts_by_state(null, null))
        .map(row => WorkerPool.fromDb(row));
      for (const workerPool of workerPools) {
        const start = process.hrtime.bigint();
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

        if (!poolsByProvider.has(providerId)) {
          poolsByProvider.set(providerId, new Set());
        }
        poolsByProvider.get(providerId).add(workerPoolId);

        const providerByPool = providersByPool.get(workerPoolId) || {
          providers: new Set(),
          existingCapacity: 0,
          requestedCapacity: 0,
        };

        try {
          const workerInfo = {
            existingCapacity: providerByPool.existingCapacity,
            requestedCapacity: providerByPool.requestedCapacity,
          };
          await provider.provision({ workerPool, workerInfo });
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
          if (!providerByPool.providers.has(pId)) {
            await this.db.fns.remove_worker_pool_previous_provider_id(workerPoolId, pId);
          }

        }));

        const duration = Number(process.hrtime.bigint() - start) / 1e9;

        this.monitor.log.workerPoolProvisioned({
          workerPoolId: workerPool.workerPoolId,
          providerId: workerPool.providerId,
          duration,
        });
      }

      // Now allow providers to do whatever per-loop cleanup they may need
      await this.providers.forAll(p => p.cleanup());
    } finally {
      this.provisioningLoopAlive = false; // Allow lib-iterate to start a loop again
    }

  }
}

module.exports = {
  Provisioner,
};
