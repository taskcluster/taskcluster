const {ApiError, Provider} = require('./provider');
const aws = require('aws-sdk');
const taskcluster = require('taskcluster-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const {CloudAPI} = require('./cloudapi');

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
    this.providerConfig = Object.assign({}, {
      intervalCapDefault: 150,
      intervalDefault: 10 * 1000,
      _backoffDelay: 2000,
    }, providerConfig);

  }

  async setup() {
    const ec2 = new aws.EC2({
      credentials: this.providerConfig.credentials,
      region: 'us-east-1', // This is supposed to be the default region for EC2 requests, but in practice it would throw an error without a region
    });

    const regions = (await ec2.describeRegions({}).promise()).Regions;

    let requestTypes = {};
    this.ec2s = {};
    regions.forEach(r => {
      this.ec2s[r.RegionName] = new aws.EC2({
        region: r.RegionName,
        credentials: this.providerConfig.credentials,
      });
      // These three categories are described in https://docs.aws.amazon.com/AWSEC2/latest/APIReference/query-api-troubleshooting.html#api-request-rate
      for (const category of ['describe', 'modify', 'security']) {
        // AWS does not publish limits for each category so we just pick some nice round numbers with the defaults
        // The backoff and retry should handle it if these are too high and we can tune them over time
        requestTypes[`${r.RegionName}.${category}`] = {};
      }
    });

    const cloud = new CloudAPI({
      types: Object.keys(requestTypes),
      apiRateLimits: requestTypes,
      intervalDefault: this.providerConfig.intervalDefault,
      intervalCapDefault: this.providerConfig.intervalCapDefault,
      monitor: this.monitor,
      providerId: this.providerId,
      errorHandler: ({err, tries}) => {
        if (err.code === 'RequestLimitExceeded') {
          return {backoff: this.providerConfig._backoffDelay * Math.pow(2, tries), reason: 'RequestLimitExceeded', level: 'warning'};
        }
        throw err;
      },
    });
    this._enqueue = cloud.enqueue.bind(cloud);
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
      runningCapacity: workerPool.providerData[this.providerId].running,
    });
    if (toSpawn === 0) {
      return;
    }
    const toSpawnPerConfig = Math.ceil(toSpawn / workerPool.config.launchConfigs.length);
    const shuffledConfigs = _.shuffle(workerPool.config.launchConfigs);

    let toSpawnCounter = toSpawn;
    for await (let config of shuffledConfigs) {
      if (toSpawnCounter <= 0) break; // eslint-disable-line
      // Make sure we don't get "The same resource type may not be specified
      // more than once in tag specifications" errors
      const TagSpecifications = config.launchConfig.TagSpecifications || [];
      const instanceTags = [];
      const otherTagSpecs = [];
      TagSpecifications.forEach(ts =>
        ts.ResourceType === 'instance' ? instanceTags.concat(ts.Tags) : otherTagSpecs.push(ts),
      );

      const userData = Buffer.from(JSON.stringify({
        ...config.additionalUserData,
        rootUrl: this.rootUrl,
        workerPoolId,
        providerId: this.providerId,
        workerGroup: this.providerId,
        workerConfig: config.workerConfig || {},
      }));
      // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-add-user-data
      // The raw data should be 16KB maximum
      if (userData.length > 16384) {
        return await workerPool.reportError({
          kind: 'creation-error',
          title: 'User Data is too long',
          description: 'Try removing some workerConfiguration and consider putting it in a secret',
          notify: this.notify,
          WorkerPoolError: this.WorkerPoolError,
        });
      }

      const instanceCount = Math.ceil(Math.min(toSpawnCounter, toSpawnPerConfig) / config.capacityPerInstance);
      let spawned;
      try {
        spawned = await this._enqueue(`${config.region}.modify`, () => this.ec2s[config.region].runInstances({
          ...config.launchConfig,

          UserData: userData.toString('base64'), // The string needs to be base64-encoded. See the docs above

          MaxCount: instanceCount,
          MinCount: instanceCount,
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
        }).promise());
      } catch (e) {
        return await workerPool.reportError({
          kind: 'creation-error',
          title: 'Instance Creation Error',
          description: `Error calling AWS API: ${e.message}`,
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
            instanceCapacity: config.capacityPerInstance,
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
    if (!document || !signature || !(typeof document === "string")) {
      throw new ApiError('Request must include both a document (string) and a signature');
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
      const region = worker.providerData.region;
      instanceStatuses = (await this._enqueue(`${region}.describe`, () => this.ec2s[region].describeInstanceStatus({
        InstanceIds: [worker.workerId.toString()],
        IncludeAllInstances: true,
      }).promise())).InstanceStatuses;
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
          this.seen[worker.workerPoolId] += worker.providerData.instanceCapacity || 1;
          return Promise.resolve();

        case 'terminated':
        case 'stopped':
          return worker.modify(w => {w.state = this.Worker.states.STOPPED;});

        default:
          return Promise.reject(`Unknown state: ${is.InstanceState.Name} for ${is.InstanceId}`);
      }
    }));
  }

  async removeWorker({worker}) {
    let result;
    try {
      const region = worker.providerData.region;
      result = await this._enqueue(`${region}.modify`, () => this.ec2s[region].terminateInstances({
        InstanceIds: [worker.workerId],
      }).promise());
    } catch (e) {
      const workerPool = await this.WorkerPool.load({
        workerPoolId: worker.workerPoolId,
      });
      await workerPool.reportError({
        kind: 'termination-error',
        title: 'Instance Termination Error',
        description: `Error terminating AWS instance: ${e.message}`,
        notify: this.notify,
        WorkerPoolError: this.WorkerPoolError,
      });

      return;
    }

    result.TerminatingInstances.forEach(ti => {
      if (!ti.InstanceId === worker.workerId || !ti.CurrentState.Name === 'shutting-down') {
        throw new Error(
          `Unexpected error: expected to shut down instance ${worker.workerId} but got ${ti.CurrentState.Name} state for ${ti.InstanceId} instance instead`,
        );
      }

    });
  }

  async scanPrepare() {
    this.seen = {};
  }

  async scanCleanup({responsibleFor}) {
    for (const workerPoolId of responsibleFor) {
      this.seen[workerPoolId] = this.seen[workerPoolId] || 0;
    }
    this.monitor.notice('scan-seen', {providerId: this.providerId, seen: this.seen, responsible: [...responsibleFor]});
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
