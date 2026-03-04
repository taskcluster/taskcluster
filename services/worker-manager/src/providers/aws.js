import { ApiError, Provider } from './provider.js';
import {
  EC2Client,
  DescribeRegionsCommand,
  RunInstancesCommand,
  DescribeInstanceStatusCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import taskcluster from '@taskcluster/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { CloudAPI } from './cloudapi.js';
import { WorkerPool, Worker } from '../data.js';

/** @typedef {import('../data.js').WorkerPoolStats} WorkerPoolStats */

const __dirname = new URL('.', import.meta.url).pathname;

export class AwsProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-aws';
    this.ec2iid_RSA_key = fs.readFileSync(path.resolve(__dirname, 'aws-keys/RSA-key-forSignature')).toString();
    this.providerConfig = Object.assign({}, {
      intervalCapDefault: 150,
      intervalDefault: 10 * 1000,
      _backoffDelay: 2000,
    }, conf.providerConfig);

  }

  async setup() {
    const ec2 = new EC2Client({
      credentials: this.providerConfig.credentials,
      region: 'us-east-1', // This is supposed to be the default region for EC2 requests, but in practice it would throw an error without a region
    });

    const { Regions: regions } = await ec2.send(new DescribeRegionsCommand({}));

    let requestTypes = {};
    this.ec2s = {};
    regions.forEach(r => {
      this.ec2s[r.RegionName] = new EC2Client({
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

    this.cloudApi = new CloudAPI({
      types: Object.keys(requestTypes),
      apiRateLimits: requestTypes,
      intervalDefault: this.providerConfig.intervalDefault,
      intervalCapDefault: this.providerConfig.intervalCapDefault,
      timeout: 10 * 60 * 1000, // each cloud call should not take longer than 10 minutes
      throwOnTimeout: true,
      monitor: this.monitor,
      providerId: this.providerId,
      errorHandler: ({ err, tries }) => {
        if (err.code === 'RequestLimitExceeded') {
          return { backoff: this.providerConfig._backoffDelay * Math.pow(2, tries), reason: 'RequestLimitExceeded', level: 'warning' };
        }
        throw err;
      },
      collectMetrics: true,
    });
    this._enqueue = this.cloudApi.enqueue.bind(this.cloudApi);
  }

  /**
   * @param {{ workerPool: WorkerPool, workerPoolStats: WorkerPoolStats }} opts
   */
  async provision({ workerPool, workerPoolStats }) {
    const { workerPoolId } = workerPool;
    const workerInfo = workerPoolStats?.forProvision() ?? {};
    const workerInfoByWorkerGroup = workerPoolStats?.forProvisionByWorkerGroup() ?? new Map();

    if (!workerPool.providerData[this.providerId]) {
      await this.db.fns.update_worker_pool_provider_data(
        workerPool.workerPoolId, this.providerId, {});
    }

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      providerId: this.providerId,
      minCapacity: workerPool.config.minCapacity,
      maxCapacity: workerPool.config.maxCapacity,
      scalingRatio: workerPool.config.scalingRatio,
      workerInfo,
      workerInfoByWorkerGroup,
    });

    if (toSpawn === 0 || workerPool.config?.launchConfigs?.length === 0) {
      return; // Nothing to do
    }

    const {
      terminateAfter, reregistrationTimeout, queueInactivityTimeout,
    } = Provider.interpretLifecycle(workerPool.config);

    const cfgs = await this.selectLaunchConfigsForSpawn({
      workerPool,
      toSpawn,
      workerPoolStats,
      returnAll: true,
    });
    const shuffledConfigs = _.shuffle(cfgs);
    const toSpawnPerConfig = Math.ceil(toSpawn / shuffledConfigs.length);

    let toSpawnCounter = toSpawn;
    for await (let lc of shuffledConfigs) {
      const config = lc.configuration;
      if (toSpawnCounter <= 0) break; // eslint-disable-line
      // Make sure we don't get "The same resource type may not be specified
      // more than once in tag specifications" errors
      const TagSpecifications = config.launchConfig.TagSpecifications || [];
      let instanceTags = [];
      let volumeTags = [];
      let otherTagSpecs = [];
      TagSpecifications.forEach(ts => {
        if (ts.ResourceType === 'instance') {
          instanceTags = instanceTags.concat(ts.Tags);
        } else if (ts.ResourceType === 'volume') {
          volumeTags = volumeTags.concat(ts.Tags);
        } else {
          otherTagSpecs.push(ts);
        }
      });

      const userData = Buffer.from(JSON.stringify({
        ...config.additionalUserData,
        rootUrl: this.rootUrl,
        workerPoolId,
        providerId: this.providerId,
        workerGroup: config.region,
        launchConfigId: lc.launchConfigId,
        // NOTE: workerConfig is deprecated and isn't used after worker-runner v29.0.1
        workerConfig: config.workerConfig || {},
      }));
      // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-add-user-data
      // The raw data should be 16KB maximum
      if (userData.length > 16384) {
        return await this.reportError({
          workerPool,
          kind: 'creation-error',
          title: 'User Data is too long',
          description: 'Try removing some workerConfiguration and consider putting it in a secret',
          extra: {
            config: config.launchConfig,
          },
          launchConfigId: lc.launchConfigId,
        });
      }

      const capacityPerInstance = config?.workerManager?.capacityPerInstance || config.capacityPerInstance || 1;
      const instanceCount = Math.ceil(Math.min(toSpawnCounter, toSpawnPerConfig) / capacityPerInstance);
      let spawned;
      try {
        spawned = await this._enqueue(`${config.region}.modify`, () => this.ec2s[config.region].send(new RunInstancesCommand({
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
                },
                {
                  Key: 'WorkerPoolId',
                  Value: `${workerPoolId}`,
                }],
            },
            {
              ResourceType: 'volume',
              Tags: [
                ...volumeTags,
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
                },
                {
                  Key: 'WorkerPoolId',
                  Value: `${workerPoolId}`,
                }],
            },
          ],
        })));
      } catch (e) {
        return await this.reportError({
          workerPool,
          kind: 'creation-error',
          title: 'Instance Creation Error',
          description: `Error calling AWS API: ${e.message}`,
          extra: {
            config: config.launchConfig,
          },
        });
      }

      // count down the capacity we actually spawned (which may be somewhat
      // greater than toSpawnPerConfig due to rounding)
      toSpawnCounter -= instanceCount * capacityPerInstance;

      await Promise.all(spawned.Instances.map(async (i) => {
        const worker = Worker.fromApi({
          workerPoolId,
          providerId: this.providerId,
          workerGroup: config.region,
          workerId: i.InstanceId,
          expires: taskcluster.fromNow('1 week'),
          state: Worker.states.REQUESTED,
          capacity: capacityPerInstance,
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
            terminateAfter,
            reregistrationTimeout,
            queueInactivityTimeout,
            workerConfig: config.workerConfig || {},
          },
          launchConfigId: lc.launchConfigId,
        });
        await this.onWorkerRequested({ worker, terminateAfter });
        return worker.create(this.db);
      }));
    }
  }

  /**
   * This method checks instance identity document authenticity
   * If it's authentic it checks whether the data in it corresponds to the worker
   */
  async registerWorker({ worker, workerPool, workerIdentityProof }) {
    const monitor = this.workerMonitor({ worker });

    if (worker.state !== Worker.states.REQUESTED) {
      throw new ApiError('This worker is either stopped or running. No need to register');
    }

    const { document, signature } = workerIdentityProof;
    if (!document || !signature || !(typeof document === "string")) {
      throw new ApiError('Request must include both a document (string) and a signature');
    }

    if (!this.verifyInstanceIdentityDocument({ document, signature })) {
      throw new ApiError('Instance identity document validation error');
    }

    if (!this.verifyWorkerInstance({ document, worker })) {
      throw new ApiError('Instance validation error');
    }

    let expires = taskcluster.fromNow('96 hours');
    if (worker.providerData.reregistrationTimeout) {
      expires = new Date(Date.now() + worker.providerData.reregistrationTimeout);
    }

    // mark it as running
    monitor.debug('setting state to RUNNING');
    await worker.update(this.db, worker => {
      worker.lastModified = new Date();
      worker.providerData.terminateAfter = expires.getTime();
      worker.state = Worker.states.RUNNING;
    });
    await this.onWorkerRunning({ worker });

    const workerConfig = worker.providerData.workerConfig || {};
    return {
      expires,
      workerConfig,
    };
  }

  async checkWorker({ worker }) {
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;
    this.seenByWorkerGroup[worker.workerPoolId] = this.seenByWorkerGroup[worker.workerPoolId] || {};
    const monitor = this.workerMonitor({ worker });

    let state;
    try {
      const region = worker.providerData.region;
      const instanceStatuses = (await this._enqueue(`${region}.describe`, () => this.ec2s[region].send(new DescribeInstanceStatusCommand({
        InstanceIds: [worker.workerId.toString()],
        IncludeAllInstances: true,
      })))).InstanceStatuses;
      monitor.debug(`instance statuses: ${instanceStatuses.map(is => is.InstanceState.Name).join(', ')}`);
      for (const is of instanceStatuses) {
        switch (is.InstanceState.Name) {
          case 'pending':
          case 'running':
          case 'shutting-down': //so that we don't turn on new instances until they're entirely gone
          case 'stopping':
            this.seen[worker.workerPoolId] += worker.capacity || 1;
            this.seenByWorkerGroup[worker.workerPoolId][worker.workerGroup] =
              (this.seenByWorkerGroup[worker.workerPoolId][worker.workerGroup] || 0) + (worker.capacity || 1);
            break;

          case 'terminated':
          case 'stopped':
            await this._enqueue(`${region}.modify`, () => this.ec2s[region].send(new TerminateInstancesCommand({
              InstanceIds: [worker.workerId.toString()],
            })));
            await this.onWorkerStopped({ worker });
            state = Worker.states.STOPPED;
            break;

          default:
            throw new Error(`Unknown state: ${is.InstanceState.Name} for ${is.InstanceId}`);
        }
      }
      if (worker.providerData.terminateAfter && worker.providerData.terminateAfter < Date.now()) {
        // reload the worker to make sure we have the latest data
        await worker.reload(this.db);
        if (worker.providerData.terminateAfter < Date.now()) {
          await this.removeWorker({ worker, reason: 'terminateAfter time exceeded' });
        }
      }
      const { isZombie, reason } = Provider.isZombie({ worker });
      if (isZombie) {
        await this.removeWorker({ worker, reason });
      }
    } catch (e) {
      if (![e.code, e.Code].includes('InvalidInstanceID.NotFound')) { // aws throws this error for instances that had been terminated, too
        throw e;
      }
      monitor.debug('instance status not found');
      await this.onWorkerStopped({ worker });
      state = Worker.states.STOPPED;
    }

    monitor.debug(`setting state to ${state}`);
    const now = new Date();
    await worker.update(this.db, worker => {
      if (state !== undefined) {
        worker.state = state;
        worker.lastModified = now;
      }
      worker.lastChecked = now;
    });
  }

  async removeWorker({ worker, reason }) {
    // trigger before state update so we can check the current state
    await this.onWorkerRemoved({ worker, reason });
    await worker.update(this.db, w => {
      if ([Worker.states.REQUESTED, Worker.states.RUNNING].includes(w.state)) {
        w.lastModified = new Date();
        w.state = Worker.states.STOPPING;
      }
    });
    let result;
    try {
      const region = worker.providerData.region;
      result = await this._enqueue(`${region}.modify`, () => this.ec2s[region].send(new TerminateInstancesCommand({
        InstanceIds: [worker.workerId.toString()],
      })));
    } catch (e) {
      const workerPool = await WorkerPool.get(this.db, worker.workerPoolId);
      if (workerPool) {
        await this.reportError({
          workerPool,
          kind: 'termination-error',
          title: 'Instance Termination Error',
          description: `Error terminating AWS instance: ${e.message}`,
        });
      }

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
    this.seenByWorkerGroup = {};
  }

  async scanCleanup() {
    this.monitor.log.scanSeen({
      providerId: this.providerId,
      seen: this.seen,
      total: Provider.calcSeenTotal(this.seen),
    });

    this.cloudApi?.logAndResetMetrics();

    Object.entries(this.seenByWorkerGroup).forEach(([workerPoolId, seenByGroup]) =>
      Object.entries(seenByGroup).forEach(([workerGroup, seen]) =>
        this.monitor.metric.scanSeen(seen, {
          providerId: this.providerId,
          workerPoolId,
          workerGroup,
        })));
  }

  /**
   * This is called at the end of the provision loop
   */
  async cleanup() {
    this.cloudApi?.logAndResetMetrics();
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
  verifyInstanceIdentityDocument({ document, signature }) {
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
  verifyWorkerInstance({ document, worker }) {
    const { providerData } = worker;
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
