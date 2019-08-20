const {ApiError, Provider} = require('./provider');
const aws = require('aws-sdk');
const taskcluster = require('taskcluster-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
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
    providerConfig,
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
    this.providerConfig = providerConfig;
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

    const config = this.chooseConfig({possibleConfigs: workerPool.config.launchConfigs});

    aws.config.update({region: config.region});
    aws.config.logger = console;
    const ec2 = new aws.EC2({
      apiVersion: AWS_API_VERSION,
      credentials: this.providerConfig.credentials,
    });

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      minCapacity: config.launchConfig.MinCount,
      maxCapacity: config.launchConfig.MaxCount,
      capacityPerInstance: config.capacityPerInstance,
      running: workerPool.providerData[this.providerId].running,
    });

    const userData = {
      rootUrl: this.rootUrl,
      workerPoolId,
      providerId: this.providerId,
      workerGroup: this.providerId,
    };

    let spawned;
    try {
      spawned = await ec2.runInstances({
        ...config.launchConfig,

        // please make sure this string is no more than 1024 chars long
        // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-add-user-data
        UserData: JSON.stringify(userData).toString('base64'),

        MaxCount: config.launchConfig.MaxCount ? Math.max(toSpawn, config.launchConfig.MaxCount) : toSpawn,
        MinCount: config.launchConfig.MinCount ? Math.min(toSpawn, config.launchConfig.MinCount) : toSpawn,
        TagSpecifications: [
          ...(config.launchConfig.TagSpecifications ? config.launchConfig.TagSpecifications : []),
          {
            ResourceType: 'instance',
            Tags: [
              {
                Key: 'Provider',
                Value: `wm-${this.providerId}`,
              }, {
                Key: 'Owner',
                Value: workerPool.owner,
              }],
          },
        ],
      }).promise();
    } catch (e) {
      this.monitor.err(`🚨 Error calling AWS API: ${e}`);

      return await workerPool.reportError({
        kind: 'creation-error',
        title: 'Instance Creation Error',
        description: e.message,
        notify: this.notify,
        WorkerPoolError: this.WorkerPoolError,
      });
    }

    return Promise.all(spawned.Instances.map(i => {
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
          state: i.State.Name,
          stateReason: i.StateReason.Message,
        },
      });
    }));
  }

  /**
   * This method checks instance identity document authenticity
   * If it's authentic it checks whether the data in it corresponds to the worker
   *
   * @param worker string
   * @param workerPool string
   * @param workerIdentityProof {document: string, signature: string}
   * @returns {Promise<{expires: *}>}
   */
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
    const ec2 = new aws.EC2({
      apiVersion: AWS_API_VERSION,
      credentials: this.providerConfig.credentials,
    });
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
   * Method to select instance launch specification. At the moment selects at random, which is temporary
   *
   * @param possibleConfigs Array<Object>
   * @returns Object
   */
  chooseConfig({possibleConfigs}) {
    assert(Array.isArray(possibleConfigs), 'possible configs is not an array');

    const i = Math.floor(Math.random() * possibleConfigs.length);

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

    verifier.update(document);
    let result;

    result = verifier.verify(this.ec2iid_RSA_key.toString(), signature.toString(), 'base64');

    return result;
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
    const {providerData} = worker;
    const parsedDocument = JSON.parse(document);

    if (
      providerData.privateIp !== parsedDocument.privateIp ||
      providerData.owner !== parsedDocument.accountId ||
      providerData.availabilityZone !== parsedDocument.availabilityZone ||
      providerData.architecture !== parsedDocument.architecture ||
      providerData.imageId !== parsedDocument.imageId ||
      worker.workerId !== parsedDocument.instanceId ||
      providerData.instanceType !== parsedDocument.instanceType ||
      providerData.region !== parsedDocument.region
    ) {
      throw new ApiError('Token validation error');
    }

    return;
  }
}

module.exports = {
  AwsProvider,
};
