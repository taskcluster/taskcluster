const {ApiError, Provider} = require('./provider');
const aws = require('aws-sdk');
const taskcluster = require('taskcluster-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');

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

  async setup() {
    const ec2 = new aws.EC2({
      credentials: this.providerConfig.credentials,
    });

    const regions = (await ec2.describeRegions({}).promise()).Regions;

    this.ec2s = {};
    regions.forEach(r => {
      this.ec2s[r.RegionName] = new aws.EC2({
        region: r.RegionName,
        credentials: this.providerConfig.credentials,
      });
    });
  }

  async provision({workerPool}) {
    const {workerPoolId} = workerPool;

    if (!workerPool.providerData[this.providerId] || workerPool.providerData[this.providerId].running === undefined) {
      await workerPool.modify(wt => {
        wt.providerData[this.providerId] = wt.providerData[this.providerId] || {};
        wt.providerData[this.providerId].running = wt.providerData[this.providerId].running || 0;
      });
    }

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      minCapacity: workerPool.config.minCapacity,
      maxCapacity: workerPool.config.maxCapacity,
      capacityPerInstance: 1, // todo: this will be corrected along with estimator changes
      running: workerPool.providerData[this.providerId].running,
    });
    if (toSpawn === 0) {
      return;
    }
    const toSpawnPerConfig = Math.ceil(toSpawn / workerPool.config.launchConfigs.length);

    const userData = Buffer.from(JSON.stringify({
      rootUrl: this.rootUrl,
      workerPoolId,
      providerId: this.providerId,
      workerGroup: this.providerId,
    }));
    // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-add-user-data
    // The raw data should be 16KB maximum
    if (userData.length > 16384) {
      return await workerPool.reportError({
        kind: 'creation-error',
        title: 'User Data is too long',
        description: 'Try a shorter workerPoolId and/or a shorter rootUrl',
        notify: this.notify,
        WorkerPoolError: this.WorkerPoolError,
      });
    }

    const shuffledConfigs = _.shuffle(workerPool.config.launchConfigs);

    let spawned;
    let toSpawnCounter = toSpawn;
    for await (let config of shuffledConfigs) {
      // Make sure we don't get "The same resource type may not be specified
      // more than once in tag specifications" errors
      const TagSpecifications = config.TagSpecifications ? config.TagSpecifications : [];
      const instanceTags = [];
      const otherTagSpecs = [];
      TagSpecifications.forEach(ts =>
        ts.ResourceType === 'instance' ? instanceTags.concat(ts.Tags) : otherTagSpecs.push(ts)
      );

      try {
        spawned = await this.ec2s[config.region].runInstances({
          ...config.launchConfig,

          UserData: userData.toString('base64'), // The string needs to be base64-encoded. See the docs above

          MaxCount: Math.min(toSpawnCounter, toSpawnPerConfig),
          MinCount: Math.min(toSpawnCounter, toSpawnPerConfig),
          TagSpecifications: [
            ...otherTagSpecs,
            {
              ResourceType: 'instance',
              Tags: [
                ...instanceTags,
                {
                  Key: 'CreatedBy',
                  Value: `taskcluster-wm-${this.providerId}`,
                }, {
                  Key: 'Owner',
                  Value: workerPool.owner,
                },
                {
                  Key: 'ManagedBy',
                  Value: 'taskcluster',
                },
                {
                  Key: 'Name',
                  Value: `${workerPoolId}`,
                }],
            },
          ],
        }).promise();
      } catch (e) {
        this.monitor.err(`Error calling AWS API: ${e}`);

        return await workerPool.reportError({
          kind: 'creation-error',
          title: 'Instance Creation Error',
          description: e.message,
          notify: this.notify,
          WorkerPoolError: this.WorkerPoolError,
        });
      }

      toSpawnCounter -= toSpawnPerConfig;

      await Promise.all(spawned.Instances.map(i => {
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
            amiLaunchIndex: i.AmiLaunchIndex,
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

    return;
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
    if (worker.state !== this.Worker.states.REQUESTED) {
      throw new ApiError('This worker is either stopped or running. No need to register');
    }

    const {document, signature} = workerIdentityProof;
    if (!document || !signature) {
      throw new ApiError('Token validation error');
    }

    if (!this.verifyInstanceIdentityDocument({document, signature})) {
      throw new ApiError('Instance identity document validation error');
    }

    if (!this.verifyWorkerInstance({document, worker})) {
      throw new ApiError('Instance validation error');
    }

    // mark it as running
    await worker.modify(w => {
      w.state = this.Worker.states.RUNNING;
    });

    // return object that has expires field
    return {expires: taskcluster.fromNow('96 hours')};
  }

  async checkWorker({worker}) {
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;

    let instanceStatuses;
    try {
      instanceStatuses = (await this.ec2s[worker.providerData.region].describeInstanceStatus({
        InstanceIds: [worker.workerId.toString()],
        IncludeAllInstances: true,
      }).promise()).InstanceStatuses;
    } catch (e) {
      if (e.code === 'InvalidInstanceID.NotFound') { // aws throws this error for instances that had been terminated, too
        return worker.modify(w => {w.state = this.Worker.states.STOPPED;});
      }
      throw e;
    }

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

    return verifier.verify(this.ec2iid_RSA_key.toString(), signature.toString(), 'base64');
  }

  /**
   * Method to verify the data from the instance identity document against the data on instance
   * with that id that we already have in the DB
   *
   * @param document
   * @returns boolean if everything checks out
   */
  verifyWorkerInstance({document, worker}) {
    const {providerData} = worker;
    const parsedDocument = JSON.parse(document);

    return providerData.privateIp === parsedDocument.privateIp &&
      providerData.owner === parsedDocument.accountId &&
      providerData.availabilityZone === parsedDocument.availabilityZone &&
      providerData.architecture === parsedDocument.architecture &&
      providerData.imageId === parsedDocument.imageId &&
      worker.workerId === parsedDocument.instanceId &&
      providerData.instanceType === parsedDocument.instanceType &&
      providerData.region === parsedDocument.region;
  }
}

module.exports = {
  AwsProvider,
};
