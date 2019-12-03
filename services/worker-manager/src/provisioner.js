const Entity = require('azure-entities');
const taskcluster = require('taskcluster-client');
const Iterate = require('taskcluster-lib-iterate');
const {consume} = require('taskcluster-lib-pulse');

/**
 * Run all provisioning logic
 */
class Provisioner {
  constructor({providers, iterateConf, Worker, WorkerPool, monitor, notify, pulseClient, reference, rootUrl, ownName}) {
    this.providers = providers;
    this.WorkerPool = WorkerPool;
    this.Worker = Worker;
    this.monitor = monitor;
    this.notify = notify;
    this.pulseClient = pulseClient;

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
      name: ownName,
      handler: async () => {
        await this.provision();
      },
      monitor,
      maxFailures: 10,
      watchdogTime: 0,
      waitTime: 10000,
      maxIterationTime: 900000, // We will move slowly for now with a 15 minute window
      ...iterateConf,
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
    const workerPool = await this.WorkerPool.load({workerPoolId});
    const provider = this.providers.get(providerId);

    if (!provider) {
      // ignore messages for unknown providers
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
    this.provisioningLoopAlive = true;
    // Any once-per-loop work a provider may want to do
    await this.providers.forAll(p => p.prepare());

    // track the providerIds seen for each worker pool, so they can be removed
    // from the list of previous provider IDs
    const providersByPool = new Map();
    const seen = (providerId, workerPoolId, workerCapacity) => {
      const v = providersByPool.get(workerPoolId);
      if (v) {
        v.providers.add(providerId);
        v.count += workerCapacity;
      } else {
        providersByPool.set(workerPoolId, {providers: new Set([providerId]), count: workerCapacity});
      }
    };

    // Check the workers
    await this.providers.forAll(p => p.scanPrepare());
    await this.Worker.scan({
      state: Entity.op.notEqual(this.Worker.states.STOPPED),
    }, {
      handler: async worker => {
        seen(worker.providerId, worker.workerPoolId, worker.capacity);
        const provider = this.providers.get(worker.providerId);
        if (provider) {
          try {
            await provider.checkWorker({worker});
          } catch (err) {
            this.monitor.reportError(err); // Just report it and move on so this doesn't block other providers
          }
        } else {
          this.monitor.info(
            `Worker ${worker.workerGroup}/${worker.workerId} has unknown providerId ${worker.providerId} (ignoring)`);
        }
      },
    });

    // We keep track of which providers are actively managing
    // each workerpool so that the provider can update the
    // pool even if 0 non-STOPPED instances of the worker
    // currently exist
    const poolsByProvider = new Map();

    // Now for each worker pool we ask the providers to do stuff
    await this.WorkerPool.scan({}, {
      handler: async workerPool => {
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

        const providerByPool = providersByPool.get(workerPoolId) || {providers: new Set(), count: 0};

        try {
          await provider.provision({workerPool, existingCapacity: providerByPool.count});
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

          if (!providerByPool.providers.has(pId)) {
            try {
              await provider.removeResources({workerPool});
            } catch (err) {
              // report error and try again next time..
              this.monitor.reportError(err, {workerPoolId, providerId: pId});
              return;
            }
            // the provider is done with this pool, so remove it from the list of previous providers
            await workerPool.modify(wp => {
              wp.previousProviderIds = wp.previousProviderIds.filter(pid => pid !== pId);
            });
          }

        }));

        this.monitor.log.workerPoolProvisioned({
          workerPoolId: workerPool.workerPoolId,
          providerId: workerPool.providerId,
        });
      },
    });

    // Now allow providers to do whatever per-loop cleanup they may need
    await this.providers.forAll(p => p.cleanup());
    await this.providers.forAll(p => p.scanCleanup({responsibleFor: poolsByProvider.get(p.providerId) || new Set()}));

    this.provisioningLoopAlive = false; // Allow lib-iterate to start a loop again
  }
}

module.exports = {
  Provisioner,
};
