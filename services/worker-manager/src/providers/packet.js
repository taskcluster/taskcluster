const {Provider} = require('./provider');
const Packet = require('packet-nodejs');
const taskcluster = require('taskcluster-client');
const promisifyAll = require('util-promisifyall');
const slugid = require('slugid');
const {FakePacket} = require('./fake-packet');

class PacketProvider extends Provider {
  constructor({
    providerId,
    monitor,
    notify,
    rootUrl,
    taskclusterCredentials,
    estimator,
    Worker,
    validator,
    WorkerPool,
    apiKey,
    projectId,
    fake = false,
  }) {
    super({
      providerId,
      monitor,
      notify,
      rootUrl,
      taskclusterCredentials,
      estimator,
      Worker,
      validator,
      WorkerPool,
    });

    this.configSchema = 'config-packet';

    if (fake) {
      this.packet = promisifyAll(new FakePacket(apiKey));
    } else {
      this.packet = promisifyAll(new Packet(apiKey));
    }
    this.projectId = projectId;
  }

  async provision({workerPool}) {
    const {workerPoolId} = workerPool;
    const config = workerPool.config;
    const running = await this
      .getDevices(dev => ['active', 'provisioning'].includes(dev.state))
      .then(devs => devs.length);

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      ...config,
      running,
    });

    const hostnames = [];
    for (let i = 0; i < toSpawn; ++i) {
      hostnames.push(`${workerPoolId}-${slugid.nice().replace(/_/g, '-').toLowerCase()}`);
    }

    const workerId = slugid.nice().replace(/_/g, '-').toLowerCase();
    const workerGroup = this.providerId;

    const credentials = taskcluster.createTemporaryCredentials({
      clientId: `worker/packet/${this.projectId}/${workerGroup}/${workerId}`,
      scopes: [
        `assume:worker-type:${workerPoolId}`,
        `assume:worker-id:${workerGroup}/${workerId}`,
        `queue:worker-id:${workerGroup}/${workerId}`,
        `secrets:get:worker-type:${workerPoolId}`,
        `queue:claim-work:${workerPoolId}`,
      ],
      start: taskcluster.fromNow('-15 minutes'),
      expiry: taskcluster.fromNow('96 hours'),
      credentials: this.taskclusterCredentials,
    });

    const resp = await this.packet.createSpotRequestAsync(this.projectId, {
      instance_parameters: {
        billing_cycle: config.billingCyle,
        hostnames,
        operating_system: config.operatingSystem,
        plan: config.plan,
        ip_addresses: config.ipAddresses,
        end_at: taskcluster.fromNow('1 month'),
        userdata: [
          '#cloud-config',
          `#image_repo=${config.imageRepo}`,
          `#image_tag=${config.imageTag}`,
          `#capacity=${config.capacityPerInstance}`,
          `#credentials=${JSON.stringify(credentials)}`,
          `#data=${config.userdata}`,
        ].join('\n'),
      },
      devices_min: config.minCapacity,
      devices_max: toSpawn,
      facilities: config.facilities,
      max_bid_price: config.maxBid,
    });

    return await this.Worker.create({
      workerPoolId,
      providerId: this.providerId,
      workerGroup,
      workerId,
      created: new Date(),
      expires: taskcluster.fromNow('1 week'),
      state: this.Worker.states.REQUESTED,
      providerData: {
        spotRequestId: resp.id,
        deletedDevices: 0,
      },
    });
  }

  async checkWorker({worker}) {
    if (worker.state === this.Worker.states.STOPPED) {
      return;
    }

    const spotInfo = await this.packet.getSpotRequestAsync(worker.providerData.spotRequestId);
    const devices = await Promise.all(spotInfo.devices.map(dev => {
      const deviceId = dev.href.split('/').pop();
      return this.packet
        .getDevicesAsync(null, deviceId, null)
        .then(devInfo => devInfo.devices[0]);
    }));

    // If some of the worker devices are running, change the worker
    // state to RUNNING.
    if (devices.some(dev => dev.state === 'active')) {
      await worker.modify(w => {
        w.state = this.Worker.states.RUNNING;
      });
    }

    // Remove all devices powered off
    const inactiveDevices = devices.filter(dev => dev.state === 'inactive');
    await Promise.all(
      inactiveDevices.map(dev => this.packet.removeDeviceAsync(dev.id))
    );

    await worker.modify(w => {
      w.providerData.deleteDevices += inactiveDevices.length;
      if (w.providerData.deleteDevices === spotInfo.devices_max) {
        w.state = this.Worker.states.STOPPED;
      }
    });

    if (worker.states === this.Worker.states.STOPPED) {
      await this.packet.removeSpotRequestAsync(worker.providerData.spotRequestId, false);
    }
  }

  async getDevices(state) {
    const resp = await this.packet.getDevicesAsync(this.projectId, null, null);
    if (typeof state === "function" ) {
      return resp.devices.filter(state);
    } else if (typeof state === "string") {
      return resp.devices.filter(dev => dev.state === state);
    } else {
      return resp.devices;
    }
  }
}

module.exports = {
  PacketProvider,
};
