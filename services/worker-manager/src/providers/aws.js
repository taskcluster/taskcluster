const {Provider} = require('./provider');
const aws = require('aws-sdk');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');

class AwsProvider extends Provider {
  constructor({
    providerId,
    monitor,
    rootUrl,
    Worker,
    WorkerPool,
    WorkerPoolError,
    instancePermissions,
    apiVersion,
    region,
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
    this.instancePermissions = instancePermissions;
    this.apiVersion = apiVersion;
    this.region = region;

    aws.config.update({region});
    this.iam = new aws.IAM({apiVersion});
    this.ec2 = new aws.EC2({apiVersion});
  }

  /*
   This method is used to setup permissions for the EC2 instances
   */
  async setup() {

    // POLICY
    const ec2policyName = 'TaskclusterWorkerAWSAccess';
    const ec2PolicyArn = `arn:aws:iam::aws:policy/${ec2policyName}`;
    // There can be multiple statements in a policy.
    // Maybe this.instancePermissions should just me an array of Statements?
    // also, we'll probably need the trust policy for the instance: only EC2 instances can assume the role
    // todo: think about the above
    const ec2policy = {
      "Statement": [{
        "Version": "2012-10-17",
        "Effect": "Allow",
        "Action": this.instancePermissions.actions,
        "Resource": this.instancePermissions.resource,
      }],
    };

    const freshPolicyMetadata = await readModifySet({
      read: async () => await this.iam.getPolicy({PolicyArn: ec2PolicyArn}),
      compare: async policyMetadata => {
        const existingPolicy = await this.iam.getPolicyVersion({
          PolicyArn: ec2PolicyArn,
          VersionId: policyMetadata.DefaultVersionId,
        });
        const existingPolicyDocument = JSON.parse(existingPolicy.Document);

        return _.isEqual(existingPolicyDocument.Statement, ec2policy.Statement);
      },
      modify: async policyMetadata => {
        // This won't let us roll back to a different version, but the code is simpler
        // possibly a temporary way of modifying a policy
        // a way that would allow to roll back:
        // listPolicyVersions({PolicyArn}) --> sort them by creation date --> delete the oldest --> createPolicyVersion
        // there can only be 5 versions of a policy.
        await this.iam.deletePolicyVersion({
          PolicyArn: ec2PolicyArn,
          VersionId: policyMetadata.DefaultVersionId,
        });

        await this.iam.createPolicy({
          PolicyDocument: JSON.stringify(ec2policy),
          PolicyName: ec2policyName,
        });
      },
      set: async () => await this.iam.createPolicy({
        PolicyDocument: JSON.stringify(ec2policy),
        PolicyName: ec2policyName,
      }),
    });

    // ROLE
    const trustPolicy = {
      "Version": "2012-10-17",
      "Statement": {
        "Effect": "Allow",
        "Principal": {"Service": "ec2.amazonaws.com"},
        "Action": "sts:AssumeRole",
      },
    };
    const roleName = `wm-aws-provider-${this.providerId}`;
    await readModifySet({
      read: async () => await this.iam.getRole({RoleName: roleName}),
      set: async () => await this.iam.createRole({
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        RoleName: roleName,
      }),
    });

    // ROLE + POLICY
    await readModifySet({
      set: async () => await this.iam.attachRolePolicy({
        PolicyArn: freshPolicyMetadata.Arn,
        RoleName: roleName,
      }),
      read: async () => {
        const entities = await this.iam.listEntitiesForPolicy({PolicyArn: freshPolicyMetadata.Arn});
        const role = entities.PolicyRoles.find(pr => pr.RoleName === roleName);

        if (role) {
          // so this function does two things instead of 1
          // also we always detach policy - even if the policy hasn't changed
          // todo: refactor
          await this.iam.detachRolePolicy({
            PolicyArn: freshPolicyMetadata.Arn,
            RoleName: role.RoleName,
          });

          return undefined;
        }

        return role;
      },
    });

    // INSTANCE PROFILE
    this.instanceProfile = await readModifySet({
      read: async () => await this.iam.getInstanceProfile({InstanceProfileName: roleName}),
      set: async () => await this.iam.createInstanceProfile({InstanceProfileName: roleName}),
    });

    //todo: do something to enable logging to stackdriver
  }

  async provision({workerPool}) {
    const {workerPoolId} = workerPool;

    if (!workerPool.providerData[this.providerId] || workerPool.providerData[this.providerId].running === undefined) {
      await workerPool.modify(wt => {
        wt.providerData[this.providerId] = wt.providerData[this.providerId] || {};
        wt.providerData[this.providerId].running = wt.providerData[this.providerId].running || 0;
      });
    }

    const config = this.chooseConfig(workerPool.config);

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      ...config,
      running: workerPool.providerData[this.providerId].running,
    });

    let spawned;

    try {
      spawned = await this.ec2.runInstances({
        ...config,
        IamInstanceProfile: {
          Arn: this.instanceProfile.Arn,
          Name: this.instanceProfile.InstanceProfileName,
        },
        MaxCount: config.MaxCount || toSpawn,
        MinCount: config.MinCount ? Math.min(toSpawn, config.MinCount) : toSpawn,
        Placement: {
          AvailabilityZone: this.region,
        },
        TagSpecifications: {
          ResourceType: 'instance',
          Tags: [{
            Key: 'Provider',
            Value: `wm-${this.providerId}`,
          }, {
            Key: 'Owner',
            Value: workerPool.owner,
          }],
        },
      });
    } catch (e) {
      return await workerPool.reportError({
        kind: 'creation-error',
        title: 'Instance Creation Error',
        description: e.message, // TODO: Make sure we clear exposing this with security folks
        notify: this.notify,
        WorkerPoolError: this.WorkerPoolError,
      });
    }

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
          groups: spawned.Groups,
          amiLaunchIndexes: spawned.Instances.map(i => i.AmiLaunchIndex),
        },
      });
    }));
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    // check worker's identity -
    // The way AWS works, workers will be getting temporary creds for accessing AWS APIs
    // automatically. There's no token back-and-forth

    // mark it as running
    await worker.modify(w => {
      w.state = this.Worker.states.RUNNING;
    });

    // return object that has expires field
    return {expires: taskcluster.fromNow('96 hours')};
  }

  async checkWorker({worker}) {
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;

    let instanceStatuses = (await this.ec2.describeInstanceStatus({
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
    const i = Math.random() * (possibleConfigs.length() - 1);

    return possibleConfigs[i];
  }
}

// this util copy-pasted from gcp provider
// ...and then modified/refactored etc.
// probably a candidate to abstract into ../util.js
async function readModifySet({
  compare = () => true,
  read = async () => await {},
  modify = () => {},
  set = async () => await {},
  tries = 0,
} = {}) {
  let resource;
  try {
    // First try to get the resource
    resource = await read();
  } catch (err) {
    if (err.code !== 404) {
      throw err;
    }
  }

  try {
    if (resource) {
      // If the value in is different
      // from the one we want it to be, we try to update it
      if (!compare(resource)) {
        resource = await modify(resource);
      }
      return resource;
    } else {
      // If the resource was never there in the first place, create it
      return await set();
    }
  } catch (err) {
    if (err.code !== 409 && tries < 5) {
      throw err;
    }
    await new Promise(accept => setTimeout(accept, Math.pow(2, tries) * 100));
    return await readModifySet({
      compare,
      read,
      modify,
      set,
      tries: tries++,
    });
  }
}
