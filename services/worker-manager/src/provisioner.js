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

    // TODO: make sure that iteration failures have a handler that's useful
    // I'm thinking we should have some sort of table reporting failure causes
    this.iterate = new Iterate({
      handler: async (watchdog) => {
        await this.provision(watchdog);
      },
      monitor,
      ...{
        maxFailures: 1, // TODO: Back to something reasonable
        watchdogTime: 10000, // Each provider gets 10 seconds to provision instances per workertype
        waitTime: 1000, // TODO: Back to 10000 and set it lower in tests or use zurvan
        maxIterationTime: 300000, // We really should be making it through the list at least once every 5 minutes
        ...iterateConf,
      },
    });
  }

  /**
   * Start the Provisioner
   */
  async initiate() {
    // TODO: Get full list of workers here and pass in ones for each provider
    // at startup. This will let them prepare for whatever they need to do later
    await Promise.all(Object.values(this.providers).map(x => x.initiate()));
    await new Promise(resolve => {
      this.iterate.once('started', resolve);
      this.iterate.start();
    });
  }

  /**
   * Terminate the Provisioner
   */
  async terminate() {
    await Promise.all(Object.values(this.providers).map(x => x.terminate()));
    await new Promise(resolve => {
      this.iterate.once('stopped', resolve);
      this.iterate.stop();
    });
  }

  /**
   * Run a single provisioning iteration
   */
  async provision(watchdog) {
    await this.WorkerType.scan({}, {
      handler: async entry => {
        const {pendingTasks} = await this.queue.pendingTasks(this.provisionerId, entry.name);
        this.monitor.log.workertypeProvision({
          workertype: entry.name,
          pending: pendingTasks,
        });
        watchdog.touch();
      },
    });
  }
}

module.exports = {
  Provisioner,
};
