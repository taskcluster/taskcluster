const {Provider} = require('./provider');
const aws = require('aws-sdk');

class AwsProvider extends Provider {
  constructor({workerPool}) {
    super({workerPool});
    this.configSchema = 'config-aws';

    const {region} = workerPool.config;
    const {apiVersion} = workerPool.config;

    aws.config.update({region});
    this.iam = new aws.IAM({apiVersion});
  }

  async setup() {
    // create IAM user
    const {region} = this.workerPool.config;
    const {account} = this.workerPool.providerData;
    const userName = `wm-aws-provider-${this.workerPool.providerData.userName}`;

    await readModifySet({
      read: async () => await this.iam.getUser({UserName: userName}),
      set: async () => await this.iam.createUser({UserName: userName}),
    });

    // create IAM policy
    const ec2policy = {
      "Statement": [{
        "Effect": "Allow",
        "Action": [
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeInstances",
          "ec2:TerminateInstances",
          "ec2:RunInstances",
        ],
        "Resource": `arn:aws:ec2:${region}:${account}:*`,
      }],
    };
    const policyName = 'wm-provider-ec2policy';
    await this.iam.createPolicy({
      PolicyDocument: JSON.stringify(ec2policy),
      PolicyName: policyName,
    });

    // attach the policy to the user
    await this.iam.attachUserPolicy({
      PolicyArn: `arn:aws:iam::aws:policy/${policyName}`,
      UserName: userName,
    });
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
      // If the value in google is different
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
    return await this.readModifySet({
      compare,
      read,
      modify,
      set,
      tries: tries++,
    });
  }
}
