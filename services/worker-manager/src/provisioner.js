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
    const WorkerManagerEvents = taskcluster.createClient(reference);
    const workerManagerEvents = new WorkerManagerEvents({rootUrl});
    this.bindings = [
      workerManagerEvents.workerPoolCreated(),
      workerManagerEvents.workerPoolUpdated(),
    ];

    this.iterate = new Iterate({
      name: ownName,
      handler: async () => {
        await this.scan();
        await this.provision();
      },
      monitor,
      maxFailures: 10,
      watchdogTime: 0,
      waitTime: 10000,
      maxIterationTime: 300000, // We really should be making it through the list at least once every 5 minutes
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
   * Check in on workers
   */
  async scan() {
    // track the providerIds seen for each worker pool, so they can be removed
    // from the list of previous provider IDs
    const providersByPool = new Map();
    const seen = (providerId, workerPoolId) => {
      const v = providersByPool.get(workerPoolId);
      if (v) {
        v.add(providerId);
      } else {
        providersByPool.set(workerPoolId, new Set([providerId]));
      }
    };

    await this.providers.forAll(p => p.scanPrepare());
    await this.Worker.scan({
      state: Entity.op.notEqual(this.Worker.states.STOPPED),
    }, {
      handler: async worker => {
        seen(worker.providerId, worker.workerPoolId);
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

    // Now, see if we can remove any previous providers
    await this.WorkerPool.scan({}, {
      handler: async workerPool => {
        const {providerId, previousProviderIds, workerPoolId} = workerPool;
        if (!poolsByProvider.has(providerId)) {
          poolsByProvider.set(providerId, new Set());
        }
        poolsByProvider.get(providerId).add(workerPoolId);
        const stillCurrent = providersByPool.get(workerPoolId) || new Set();
        const removable = previousProviderIds.filter(providerId => !stillCurrent.has(providerId));

        for (let providerId of removable) {
          const provider = this.providers.get(providerId);
          if (provider) {
            try {
              await provider.removeResources({workerPool});
            } catch (err) {
              // report error and try again next time..
              this.monitor.reportError(err, {workerPoolId, providerId});
              continue;
            }
          } else {
            this.monitor.info(
              `Worker pool ${workerPoolId} has unknown previous providerId ${providerId} (removing)`);
          }

          // the provider is done with this pool, so remove it from the list of previous providers
          await workerPool.modify(wp => {
            wp.previousProviderIds = wp.previousProviderIds.filter(pid => pid !== providerId);
          });
        }
      },
    });

    await this.providers.forAll(p => p.scanCleanup({responsibleFor: poolsByProvider.get(p.providerId) || new Set()}));
  }

  /**
   * Run a single provisioning iteration
   */
  async provision() {
    // Any once-per-loop work a provider may want to do
    await this.providers.forAll(p => p.prepare());

    // Now for each worker pool we ask the providers to do stuff
    await this.WorkerPool.scan({}, {
      handler: async workerPool => {
        const provider = this.providers.get(workerPool.providerId);
        if (!provider) {
          this.monitor.warning(
            `Worker pool ${workerPool.workerPoolId} has unknown providerId ${workerPool.providerId}`);
          return;
        }

        try {
          await provider.provision({workerPool});
        } catch (err) {
          this.monitor.reportError(err, {providerId: workerPool.providerId}); // Just report this and move on
        }

        await Promise.all(workerPool.previousProviderIds.map(async pId => {
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
        }));

        this.monitor.log.workerPoolProvisioned({
          workerPoolId: workerPool.workerPoolId,
          providerId: workerPool.providerId,
        });
      },
    });

    // Now allow providers to do whatever per-loop cleanup they may need
    await this.providers.forAll(p => p.cleanup());
  }
}

module.exports = {
  Provisioner,
};
