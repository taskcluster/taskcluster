const {Provider} = require('./provider');
const aws = require('aws-sdk');
const _ = require('lodash');

class AwsProvider extends Provider {
  constructor({WorkerPool, instancePermissions, apiVersion, region}) {
    super({WorkerPool});
    this.configSchema = 'config-aws';
    this.instancePermissions = instancePermissions;
    this.apiVersion = apiVersion;
    this.region = region;

    aws.config.update({region});
    this.iam = new aws.IAM({apiVersion});
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
        "Action": "sts:AssumeRole"
      }
    };
    const roleName = `wm-aws-provider-${this.providerId}`;
    const freshRole = await readModifySet({
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
      }
    });


    // INSTANCE PROFILE
    this.instanceProfile = await readModifySet({
      read: async () => await this.iam.getInstanceProfile({InstanceProfileName: roleName}),
      set: async () => await this.iam.createInstanceProfile({InstanceProfileName: roleName}),
    });

    //todo: do something to enable logging to stackdriver
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
