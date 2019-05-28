const Entity = require('azure-entities');
const Iterate = require('taskcluster-lib-iterate');

/**
 * Make sure that we visit each worker relatively frequently to update its state
 * to accurately inform provisioning logic.
 */
class WorkerScanner {
  constructor({
    Worker,
    providers,
    monitor,
    iterateConf = {},
  }) {
    this.Worker = Worker;
    this.providers = providers;
    this.monitor = monitor;
    this.iterate = new Iterate({
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
    await this.providers.forAll(p => p.scanPrepare());
    await this.Worker.scan({
      state: Entity.op.notEqual(this.Worker.states.STOPPED),
    }, {
      handler: async worker => {
        const provider = this.providers.get(worker.providerId);
        await provider.checkWorker({worker});
      },
    });
    await this.providers.forAll(p => p.scanCleanup());
  }
}

module.exports = {
  WorkerScanner,
};
