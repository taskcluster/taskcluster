const taskcluster = require('taskcluster-client');
const Iterate = require('taskcluster-lib-iterate');
const {consume} = require('taskcluster-lib-pulse');

/**
 * Run all provisioning logic
 */
class Provisioner {
  constructor({provisionerId, providers, iterateConf, WorkerType, monitor, notify, pulseClient, reference, rootUrl}) {
    this.provisionerId = provisionerId;
    this.providers = providers;
    this.WorkerType = WorkerType;
    this.monitor = monitor;
    this.notify = notify;
    this.pulseClient = pulseClient;
    const WorkerManagerEvents = taskcluster.createClient(reference);
    const workerManagerEvents = new WorkerManagerEvents({rootUrl});
    this.bindings = [
      workerManagerEvents.workerTypeCreated(),
      workerManagerEvents.workerTypeUpdated(),
      workerManagerEvents.workerTypeDeleted(),
    ];

    this.iterate = new Iterate({
      handler: async () => {
        await this.provision();
      },
      monitor,
      maxFailures: 10,
      watchdogTime: 0,
      waitTime: 60000,
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

    this.pq = await consume({
      client: this.pulseClient,
      bindings: this.bindings,
      queueName: 'workerTypeUpdates',
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
    await Promise.all(Object.values(this.providers).map(x => x.terminate()));
  }

  async onMessage({exchange, payload}) {
    const {name, provider: providerName, previousProvider} = payload;
    const workerType = await this.WorkerType.load({name});
    const provider = this.providers[providerName]; // Always have a provider
    switch (exchange.split('/').pop()) {
      case 'workertype-created': {
        await provider.createResources({workerType});
        break;
      }
      case 'workertype-updated': {
        if (providerName === previousProvider) {
          await provider.updateResources({workerType});
        } else {
          await Promise.all([
            provider.createResources({workerType}),
            this.providers[previousProvider].removeResources({workerType}),
          ]);
        }
        break;
      }
      case 'workertype-deleted': {
        await provider.removeResources({workerType});
        await workerType.remove(); // This is now gone for real
        break;
      }
      default: throw new Error(`Unknown exchange: ${exchange}`);
    }
  }

  /**
   * Run a single provisioning iteration
   */
  async provision() {
    // Any once-per-loop work a provider may want to do
    await Promise.all(Object.values(this.providers).map(x => x.prepare()));

    // Now for each workertype we ask the providers to do stuff
    await this.WorkerType.scan({}, {
      handler: async workerType => {
        const provider = this.providers[workerType.provider];

        if (workerType.scheduledForDeletion) {
          await provider.deprovision({workerType});
        } else {
          await provider.provision({workerType});
        }

        await Promise.all(workerType.previousProviders.map(async p => {
          await this.providers[p].deprovision({workerType});
        }));

        this.monitor.log.workertypeProvisioned({
          workerType: workerType.name,
          provider: workerType.provider,
        });
      },
    });

    // Now allow providers to do whatever per-loop cleanup they may need
    await Promise.all(Object.values(this.providers).map(x => x.cleanup()));
  }
}

module.exports = {
  Provisioner,
};
