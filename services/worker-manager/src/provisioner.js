const Iterate = require('taskcluster-lib-iterate');

/**
 * Run all provisioning logic
 */
class Provisioner {
  constructor({queue, provisionerId, providers, iterateConf, WorkerType, monitor}) {
    this.queue = queue;
    this.provisionerId = provisionerId;
    this.providers = providers;
    this.WorkerType = WorkerType;
    this.monitor = monitor;

    this.iterate = new Iterate({
      handler: async (watchdog) => {
        await this.provision(watchdog);
      },
      monitor,
      ...{
        maxFailures: 10,
        watchdogTime: 10000, // Each provider gets 10 seconds to provision instances per workertype
        waitTime: 10000,
        maxIterationTime: 300000, // We really should be making it through the list at least once every 5 minutes
        ...iterateConf,
      },
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
    // TODO: Get full list of workers here and pass in ones for each provider
    // at startup. This will let them prepare for whatever they need to do later
    await Promise.all(Object.values(this.providers).map(x => x.initiate()));
    await this.iterate.start();
  }

  /**
   * Terminate the Provisioner
   */
  async terminate() {
    await Promise.all(Object.values(this.providers).map(x => x.terminate()));
    await this.iterate.stop();
  }

  /**
   * Run a single provisioning iteration
   */
  async provision(watchdog) {
    await this.WorkerType.scan({}, {
      handler: async workerType => {
        const provider = this.providers[workerType.provider];

        // This should not happen because we assert at workertype
        // creation/update time that the provider exists and we
        // don't allow providers that have workertypes to be deleted
        // but that logic seems iffy enough that an explicit alert
        // here would be nice
        if (!provider) {
          const err = new Error('Missing Provider');
          err.provider = workerType.provider;
          err.available = Object.keys(this.providers);
          throw err;
        }

        // TODO: Time this and report below
        provider.provision(workerType);

        this.monitor.log.workertypeProvision({
          workerType: workerType.name,
          provider: workerType.provider,
        });
        watchdog.touch();
      },
    });
  }
}

module.exports = {
  Provisioner,
};
