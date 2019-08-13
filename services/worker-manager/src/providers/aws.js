const {ApiError, Provider} = require('./provider');
const aws = require('aws-sdk');
const taskcluster = require('taskcluster-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require("path");
const {AWS_API_VERSION} = require('../constants');

class AwsProvider extends Provider {
  constructor({
    providerId,
    monitor,
    rootUrl,
    Worker,
    WorkerPool,
    WorkerPoolError,
    estimator,
    validator,
    notify,
  }) {
    super({
      providerId,
      monitor,
      rootUrl,
      Worker,
      WorkerPool,
      WorkerPoolError,
      estimator,
      validator,
      notify,
    });
    this.configSchema = 'config-aws';
    this.ec2iid_RSA_key = fs.readFileSync(path.resolve(__dirname, 'aws-keys/RSA-key-forSignature')).toString();
  }

  /*
   This method is used to setup permissions for the EC2 instances
   */
  async setup() {
  }

  async provision({workerPool}) {
    const {workerPoolId} = workerPool;

    if (!workerPool.providerData[this.providerId] || workerPool.providerData[this.providerId].running === undefined) {
      await workerPool.modify(wt => {
        wt.providerData[this.providerId] = wt.providerData[this.providerId] || {};
        wt.providerData[this.providerId].running = wt.providerData[this.providerId].running || 0;
      });
    }

    console.log('🎱', JSON.stringify(workerPool, null, 2));
    const config = this.chooseConfig({possibleConfigs: workerPool.config.launchConfigs});

    aws.config.update({region: config.region});
    const ec2 = new aws.EC2({apiVersion: AWS_API_VERSION});

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      minCapacity: 1, // todo
      maxCapacity: 2, // todo
      capacityPerInstance: 1, //todo
      running: workerPool.providerData[this.providerId].running,
    });

    console.log('🌀', toSpawn);

    let spawned;

    try {
      spawned = await ec2.runInstances({
        ...config.launchConfig,
        MaxCount: config.MaxCount || toSpawn,
        MinCount: config.MinCount ? Math.min(toSpawn, config.MinCount) : toSpawn,
        TagSpecifications: {
          ResourceType: 'instance',
          Tags: [
            ...(config.launchConfig.TagSpecifications ? config.launchConfig.TagSpecifications.Tags : []),
            {
              Key: 'Provider',
              Value: `wm-${this.providerId}`,
            }, {
              Key: 'Owner',
              Value: workerPool.owner,
            }],
        },
      });
    } catch (e) {
      console.log('🚨', e);
      return await workerPool.reportError({
        kind: 'creation-error',
        title: 'Instance Creation Error',
        description: 'Error creating instances in AWS',
        notify: this.notify,
        WorkerPoolError: this.WorkerPoolError,
      });
    }

    console.log('🐣', spawned);

    Promise.all(spawned.Instances.map(i => {
      return this.Worker.create({
        workerPoolId,
        providerId: this.providerId,
        workerGroup: this.providerId,
        workerId: i.InstanceId,
        created: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: this.Worker.states.REQUESTED,
        providerData: {
          region: config.region,
          groups: spawned.Groups,
          amiLaunchIndexes: spawned.Instances.map(i => i.AmiLaunchIndex),
          imageId: i.ImageId,
          instanceType: i.InstanceType,
          architecture: i.Architecture,
          availabilityZone: i.Placement.AvailabilityZone,
          privateIp: i.PrivateIpAddress,
          owner: spawned.OwnerId,
        },
      });
    }));
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    const {document, signature} = workerIdentityProof;
    if (!document || !signature) {
      throw new ApiError('Token validation error');
    }

    if (!this.verifyInstanceIdentityDocument({document, signature})) {
      throw new ApiError('Instance identity document validation error');
    }
    this.verifyWorkerInstance({document, worker});

    // mark it as running
    await worker.modify(w => {
      w.state = this.Worker.states.RUNNING;
    });

    // return object that has expires field
    return {expires: taskcluster.fromNow('96 hours')};
  }

  async checkWorker({worker}) {
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;

    aws.config.update({region: worker.providerData.region});
    const ec2 = new aws.EC2({apiVersion: AWS_API_VERSION});
    let instanceStatuses = (await ec2.describeInstanceStatus({
      InstanceIds: [worker.workerId.toString()],
    })).data;

    Promise.all(instanceStatuses.map(is => {
      switch (is.InstanceState.Name) {
        case 'pending':
        case 'running':
        case 'shutting-down': //so that we don't turn on new instances until they're entirely gone
        case 'stopping':
          this.seen[worker.workerPoolId] += 1;
          return Promise.resolve();

        case 'terminated':
        case 'stopped':
          return worker.modify(w => {w.state = this.Worker.states.STOPPED;});

        default:
          return Promise.reject(`Unknown state: ${is.InstanceState.Name} for ${is.InstanceId}`);
      }
    }));
  }

  // should this be implemented on Provider? Looks like it's going to be the same for all providers
  async scanPrepare() {
    this.seen = {};
    this.errors = {};
  }

  async scanCleanup() {
    await Promise.all(Object.entries(this.seen).map(async ([workerPoolId, seen]) => {
      const workerPool = await this.WorkerPool.load({
        workerPoolId,
      }, true);

      if (!workerPool) {
        return; // In this case, the worker pool has been deleted so we can just move on
      }

      await workerPool.modify(wp => {
        if (!wp.providerData[this.providerId]) {
          wp.providerData[this.providerId] = {};
        }
        wp.providerData[this.providerId].running = seen;
      });
    }));
  }

  /**
   * Method to select instance launch specification. At the moment selects at random
   *
   * @param possibleConfigs Array<Object>
   * @returns Object
   */
  chooseConfig({possibleConfigs}) {
    if (!Array.isArray(possibleConfigs)) {
      throw new Error('possible configs is not an array');
    }

    const i = Math.floor(Math.random() * possibleConfigs.length);

    console.log('🎲', i);

    return possibleConfigs[i];
  }

  /**
   * Method to verify the instance identity document against the signature and public key
   * The signature is the one that is obtained by calling
   * http://169.254.169.254/latest/dynamic/instance-identity/signature
   * endpoint. The endpoint produces base64-encoded data, so no conversions
   * are necessary prior to sending
   *
   * @param document - a string or a buffer
   * @param signature - base64-encoded data (can be a string or buffer)
   * @returns boolean (true if verification is successful)
   */
  verifyInstanceIdentityDocument({document, signature}) {
    const verifier = crypto.createVerify('sha256');

    verifier.update(document.toString());
    return verifier.verify(this.ec2iid_RSA_key.toString(), signature.toString(), 'base64');
  }

  /**
   * Method to verify the data from the instance identity document against the data on instance
   * with that id that we already have in the DB
   *
   * @param document
   * @returns void if everything checks out
   * @throws an error if there's any difference
   */
  verifyWorkerInstance({document, worker}) {
    const providerData = {worker};

    if (
      providerData.privateIp !== document.privateIp ||
      providerData.owner !== document.accountId ||
      providerData.availabilityZone !== document.availabilityZone ||
      providerData.architecture !== document.architecture ||
      providerData.imageId !== document.imageId ||
      worker.workerId !== document.instanceId ||
      providerData.instanceType !== document.instanceType
    ) {
      throw new ApiError('Token validation error');
    }

    return;
  }
}

module.exports = {
  AwsProvider,
};
