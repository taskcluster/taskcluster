const taskcluster = require('taskcluster-client');
const Iterate = require('taskcluster-lib-iterate');
const {consume} = require('taskcluster-lib-pulse');
const {WorkerPool, Worker} = require('./data');

/**
 * Run all provisioning logic
 */
class Provisioner {
  constructor({providers, iterateConf, Worker, WorkerPool,
    monitor, notify, pulseClient, db, reference,
    rootUrl, ownName}) {
    this.providers = providers;
    this.WorkerPool = WorkerPool;
    this.Worker = Worker;
    this.monitor = monitor;
    this.notify = notify;
    this.pulseClient = pulseClient;
    this.db = db;

    // lib-iterate will have loops stand on top of each other
    // so we will explicitly grab a mutex in each loop to ensure
    // we're the only one going at any given time
    this.provisioningLoopAlive = false;

    const WorkerManagerEvents = taskcluster.createClient(reference);
    const workerManagerEvents = new WorkerManagerEvents({rootUrl});
    this.bindings = [
      workerManagerEvents.workerPoolCreated(),
      workerManagerEvents.workerPoolUpdated(),
    ];

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

    this.pq = await consume({
      client: this.pulseClient,
      bindings: this.bindings,
      queueName: 'workerPoolUpdates',
    },
    this.monitor.timedHandler('notification', this.onMessage.bind(this)),
    );
  }

  /**
   * Terminate the Provisioner
   */
  async terminate() {
    if (this.pq) {
      await this.pq.stop();
      this.pq = null;
    }
    await this.iterate.stop();
    await this.providers.forAll(p => p.terminate());
  }

  async onMessage({exchange, payload}) {
    const {workerPoolId, providerId, previousProviderId} = payload;
    const workerPool = await WorkerPool.get(this.db, workerPoolId);
    const provider = this.providers.get(providerId);

    if (!workerPool || !provider) {
      // ignore messages for unknown worker pools and providers
      return;
    }

    switch (exchange.split('/').pop()) {
      case 'worker-pool-created': {
        await provider.createResources({workerPool});
        break;
      }
      case 'worker-pool-updated': {
        if (providerId === previousProviderId) {
          await provider.updateResources({workerPool});
        } else {
          await provider.createResources({workerPool});
        }
        break;
      }
      default: throw new Error(`Unknown exchange: ${exchange}`);
    }
  }

  /**
   * Run a single provisioning iteration
   */
  async provision() {
    if (this.provisioningLoopAlive) {
      this.monitor.notice('loop-interference', {});
      return;
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
        const v = providersByPool.get(worker.workerPoolId);
        const isRequested = worker.state === Worker.states.REQUESTED;
        // compute the number of instances that have not yet called "registerWorker"
        const requestedCapacity = isRequested ? worker.capacity : 0;
        if (v) {
          v.providers.add(worker.providerId);
          v.existingCapacity += worker.capacity;
          v.requestedCapacity += requestedCapacity;
        } else {
          providersByPool.set(worker.workerPoolId, {
            providers: new Set([worker.providerId]),
            existingCapacity: worker.capacity,
            requestedCapacity,
          });
        }
      };

      // Check the state of workers (state is updated by worker-scanner)
      await Worker.getWorkers(this.db, {}, {
        handler: (worker) => {
          if (worker.state !== Worker.states.STOPPED) {
            seen(worker);
          }
        },
      });

      // We keep track of which providers are actively managing
      // each workerpool so that the provider can update the
      // pool even if 0 non-STOPPED instances of the worker
      // currently exist
      const poolsByProvider = new Map();

      // Now for each worker pool we ask the providers to do stuff
      const workerPools = (await this.db.fns.get_worker_pools_with_capacity(null, null))
        .map(row => WorkerPool.fromDb(row));
      for (const workerPool of workerPools) {
        const {providerId, previousProviderIds, workerPoolId} = workerPool;
        const provider = this.providers.get(providerId);
        if (!provider) {
          this.monitor.warning(
            `Worker pool ${workerPool.workerPoolId} has unknown providerId ${workerPool.providerId}`);
          return;
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
          await provider.provision({workerPool, workerInfo});
        } catch (err) {
          this.monitor.reportError(err, {providerId: workerPool.providerId}); // Just report this and move on
        }

        await Promise.all(previousProviderIds.map(async pId => {
          const provider = this.providers.get(pId);
          if (!provider) {
            this.monitor.info(
              `Worker pool ${workerPool.workerPoolId} has unknown previousProviderIds entry ${pId} (ignoring)`);
            return;
          }

          try {
            await provider.deprovision({workerPool});
          } catch (err) {
            this.monitor.reportError(err, {providerId: pId}); // Just report this and move on
          }

          // Now if this provider is no longer a provider for any workers that exist
          // in this pool, we allow it to clean up any resources it has and then we remove
          // it from the previous providers list
          if (!providerByPool.providers.has(pId)) {
            try {
              await provider.removeResources({workerPool});
            } catch (err) {
              // report error and try again next time..
              this.monitor.reportError(err, {workerPoolId, providerId: pId});
              return;
            }
            // the provider is done with this pool, so remove it from the list of previous providers
            await this.db.fns.remove_worker_pool_previous_provider_id(workerPoolId, pId);
          }

        }));

        this.monitor.log.workerPoolProvisioned({
          workerPoolId: workerPool.workerPoolId,
          providerId: workerPool.providerId,
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
