const Iterate = require('taskcluster-lib-iterate');
const taskcluster = require('taskcluster-client');
const { paginatedIterator } = require('taskcluster-lib-postgres');
const { Worker } = require('./data');

/**
 * Make sure that we visit each worker relatively frequently to update its state
 * to accurately inform provisioning logic.
 */
class WorkerScanner {
  constructor({
    ownName,
    WorkerPool,
    providers,
    monitor,
    iterateConf = {},
    db,
  }) {
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
    this.db = db;
  }

  async initiate() {
    await this.iterate.start();
  }

  async terminate() {
    await this.iterate.stop();
  }

  async scan() {
    await this.providers.forAll(p => p.scanPrepare());

    const fetch = async (size, offset) => await this.db.fns.get_non_stopped_workers(null, null, null, size, offset);
    for await (let row of paginatedIterator({ fetch })) {
      const worker = Worker.fromDb(row);
      const provider = this.providers.get(worker.providerId);
      if (provider) {
        try {
          await provider.checkWorker({ worker });
        } catch (err) {
          this.monitor.reportError(err); // Just report it and move on so this doesn't block other providers
        }
      } else {
        this.monitor.info(
          `Worker ${worker.workerGroup}/${worker.workerId} has unknown providerId ${worker.providerId} (ignoring)`);
      }

      // If the worker will be expired soon but it still exists,
      // update it to stick around a while longer. If this doesn't happen,
      // long-lived instances become orphaned from the provider. We don't update
      // this on every loop just to avoid the extra work when not needed
      if (worker.expires < taskcluster.fromNow('1 week')) {
        await worker.update(this.db, worker => {
          worker.expires = taskcluster.fromNow('8 days');
        });
      }
    }

    await this.providers.forAll(p => p.scanCleanup());
  }
}

module.exports = {
  WorkerScanner,
};
