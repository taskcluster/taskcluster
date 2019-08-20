const Entity = require('azure-entities');
const Iterate = require('taskcluster-lib-iterate');

/**
 * Make sure that we visit each worker relatively frequently to update its state
 * to accurately inform provisioning logic.
 */
class WorkerScanner {
  constructor({
    ownName,
    Worker,
    WorkerPool,
    providers,
    monitor,
    iterateConf = {},
  }) {
    this.Worker = Worker;
    this.WorkerPool = WorkerPool;
    this.providers = providers;
    this.monitor = monitor;
    this.iterate = new Iterate({
      name: ownName,
      handler: async () => {
        await this.scan();
      },
      monitor,
      maxFailures: 10,
      watchdogTime: 0,
      waitTime: 20000,
      maxIterationTime: 600000,
      ...iterateConf,
    });
    this.iterate.on('error', () => {
      this.monitor.alert('iteration failed repeatedly; terminating process');
      process.exit(1);
    });
  }

  async initiate() {
    await this.iterate.start();
  }

  async terminate() {
    await this.iterate.stop();
  }

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
          console.log('GOT PROVIDER. CHECKING...');
          await provider.checkWorker({worker});
        } else {
          this.monitor.info(
            `Worker ${worker.workerGroup}/${worker.workerId} has unknown providerId ${worker.providerId} (ignoring)`);
        }
      },
    });
    await this.providers.forAll(p => p.scanCleanup());

    // Now, see if we can remove any previous providers
    await this.WorkerPool.scan({}, {
      handler: async workerPool => {
        const {previousProviderIds, workerPoolId} = workerPool;
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
  }
}

module.exports = {
  WorkerScanner,
};
