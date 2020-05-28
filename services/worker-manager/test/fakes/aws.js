const {FakeCloud} = require('./fake');
const assert = require('assert').strict;
const aws = require('aws-sdk');

/**
 * Fake the EC2 AWS SDK.
 */
class FakeEC2 extends FakeCloud {
  constructor() {
    super();
  }

  _patch() {
    this.sinon.stub(aws, 'EC2').callsFake(options => {
      assert(options.region, 'region is required');
      return this.rgn(options.region);
    });
    this._reset();
  }

  _reset() {
    this._regions = new Map();
  }

  /**
   * Get the fake for a particular region, creating it if necessary
   */
  rgn(r) {
    if (!this._regions.has(r)) {
      this._regions.set(r, new FakeEC2Region(r, this));
    }
    return this._regions.get(r);
  }
}

const ec2Method = (context, method) => {
  return {
    promise: () => {
      const result = method.call(context);
      assert(result instanceof Promise);
      return result;
    },
  };
};

/**
 * A fake region-specific EC2 client.  This has the SDK methods (all with a `.promise()`
 * trailer).  It also has properties:
 *
 *  - runInstancesCalls: an array of the launch config passsed to each runInstances call
 *  - terminatedInstances: instance IDs for which terminateInstances has been called
 *  - instanceStatuses: values returned from describeInstanceStatus, in the form {instanceId: state}
 */
class FakeEC2Region {
  constructor(region, fake) {
    this.region = region;
    this.fake = fake;
    this.nextInstanceId = 1000;
    this.runInstancesCalls = [];
    this.terminatedInstances = [];
    this.instanceStatuses = {};
  }

  runInstances(launchConfig) {
    return ec2Method(this, async () => {
      this.fake.validate(launchConfig, 'aws-launch-config.yml');

      this.runInstancesCalls.push(launchConfig);

      let Instances = [];
      for (let i = 0; i < launchConfig.MinCount; i++) {
        const instance = {
          InstanceId: `i-${this.nextInstanceId++}`,
          AmiLaunchIndex: '',
          ImageId: launchConfig.ImageId,
          InstanceType: launchConfig.InstanceType || 'm2.micro',
          Architecture: 'x86',
          Placement: {
            AvailabilityZone: `${this.region}-c`,
          },
          PrivateIpAddress: '1.1.1.1',
          OwnerId: '123123123',
          State: {
            Name: 'running',
          },
          StateReason: {
            Message: 'yOu LaunCHed iT!!!1',
          },
        };

        Instances.push(instance);
      }
      return {
        Instances,
        Groups: [],
        OwnerId: '123123123',
      };
    });
  }

  describeRegions() {
    return ec2Method(this, async () => {
      return {
        Regions: [
          {RegionName: 'us-west-2'},
          {RegionName: 'us-east-1'},
          {RegionName: 'eu-central-1'},
        ],
      };
    });
  }

  terminateInstances({InstanceIds}) {
    return ec2Method(this, async() => {
      return {
        TerminatingInstances: InstanceIds.map(InstanceId => {
          this.terminatedInstances.push(InstanceId);
          return {InstanceId, CurrentState: {Name: 'shutting-down'}};
        }),
      };
    });
  }

  /**
   * Return instance statuses based on this.instanceStatuses
   *
   * NOTE: this only returns {InstanceState: {Name}, InstanceId
   *
   * https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeInstanceStatus-property
   */
  describeInstanceStatus({InstanceIds}) {
    return ec2Method(this, async() => {
      return {
        InstanceStatuses: InstanceIds.map(InstanceId => {
          const state = this.instanceStatuses[InstanceId];
          assert(state, `No value in instanceStatuses[${InstanceId}]`);
          return {InstanceState: {Name: state}, InstanceId};
        }),
      };
    });
  }
}

exports.FakeEC2 = FakeEC2;
