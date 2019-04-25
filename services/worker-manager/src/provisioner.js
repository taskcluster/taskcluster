const Iterate = require('taskcluster-lib-iterate');

/**
 * Run all provisioning logic
 */
class Provisioner {
  constructor({provisionerId, providers, iterateConf, WorkerType, monitor, notify}) {
    this.provisionerId = provisionerId;
    this.providers = providers;
    this.WorkerType = WorkerType;
    this.monitor = monitor;
    this.notify = notify;

    this.iterate = new Iterate({
      handler: async (watchdog) => {
        await this.provision(watchdog);
      },
      monitor,
      maxFailures: 10,
      watchdogTime: 20000, // Each provider gets 20 seconds to provision instances per workertype
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
    await Promise.all(Object.values(this.providers).map(x => x.initiate()));
    await this.iterate.start();
  }

  /**
   * Terminate the Provisioner
   */
  async terminate() {
    await this.iterate.stop();
    await Promise.all(Object.values(this.providers).map(x => x.terminate()));
  }

  /**
   * Run a single provisioning iteration
   */
  async provision(watchdog) {
    // Any once-per-loop work a provider may want to do
    await Promise.all(Object.values(this.providers).map(x => x.prepare()));

    // Now for each workertype we ask the providers to do stuff
    await this.WorkerType.scan({}, {
      handler: async workerType => {
        const provider = this.providers[workerType.provider];

        // This should not happen because we assert at workertype
        // creation/update time that the provider exists and we
        // don't allow providers that have workertypes to be deleted
        // but that logic seems iffy enough that an explicit alert
        // here would be nice
        if (!provider) {
          await workerType.reportError({
            kind: 'unknown-provider',
            title: 'Unknown Provider',
            description: 'The selected provider does not exist in Taskcluster.',
            extra: {
              provider,
              available: Object.keys(this.providers),
            },
            notify: this.notify,
            owner: workerType.owner,
          });
          return;
        }

        await provider.provision({workerType});

        this.monitor.log.workertypeProvisioned({
          workerType: workerType.name,
          provider: workerType.provider,
        });
        watchdog.touch();
      },
    });

    // Now allow providers to do whatever per-loop cleanup they may need
    await Promise.all(Object.values(this.providers).map(x => x.cleanup()));
  }
}

module.exports = {
  Provisioner,
};
