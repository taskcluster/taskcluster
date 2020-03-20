const Entity = require('taskcluster-lib-entities');
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
      maxFailures: 10,
      watchdogTime: 0,
      waitTime: 20000,
      maxIterationTime: 6000000,
      ...iterateConf,
      name: ownName,
      handler: async () => {
        await this.scan();
      },
      monitor,
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
    await this.providers.forAll(p => p.scanPrepare());
    await this.Worker.scan({}, {
      handler: async worker => {
        // We only support conditions on dates, as they cannot
        // be used to inject SQL -- `Date.toJSON` always produces a simple string
        // with no SQL metacharacters.
        //
        // Previously with azure, we added the query in the scan method
        // (i.e., this.Worker.scan(query, ...)) but since the query doesn't include
        // the partition key or row key, we would need to manually filter through
        // the table.
        if (worker.state !== this.Worker.states.STOPPED) {
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
        }
      },
    });
    await this.providers.forAll(p => p.scanCleanup());
  }
}

module.exports = {
  WorkerScanner,
};
