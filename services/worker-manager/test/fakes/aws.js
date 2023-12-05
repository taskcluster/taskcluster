import { FakeCloud } from './fake.js';
import { strict as assert } from 'assert';
import {
  EC2Client,
  DescribeInstanceStatusCommand,
  DescribeRegionsCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';

const TEST_REGIONS = [
  'us-west-2',
  'us-east-1',
  'eu-central-1',
];

/**
 * Fake the EC2 AWS SDK.
 */
export class FakeEC2 extends FakeCloud {
  constructor() {
    super();
  }

  _patch() {
    this._reset();
  }

  _reset() {
    this.mock = mockClient(EC2Client);
    this._regions = new Map();
    TEST_REGIONS.forEach((region) => {
      this.rgn(region);
    });
  }

  _restore() {
    this.mock.restore();
  }

  /**
   * Get the mock for a particular region, creating it if necessary
   */
  rgn(r) {
    if (!this._regions.has(r)) {
      this.mock.nextInstanceId = 1000;
      this.mock.runInstancesCalls = [];
      this.mock.terminatedInstances = [];
      this.mock.instanceStatuses = {};
      this.runInstances(r);
      this.describeRegions();
      this.terminateInstances();
      this.describeInstanceStatus();
      this._regions.set(r, this.mock);
    }
    return this._regions.get(r);
  }

  runInstances(r) {
    this.mock
      .on(RunInstancesCommand)
      .callsFake((launchConfig) => {
        this.validate(launchConfig, 'aws-launch-config.yml');
        this.mock.runInstancesCalls.push(launchConfig);
        let Instances = [];

        for (let i = 0; i < launchConfig.MinCount; i++) {
          const instance = {
            InstanceId: `i-${this.mock.nextInstanceId++}`,
            AmiLaunchIndex: '',
            ImageId: launchConfig.ImageId,
            InstanceType: launchConfig.InstanceType || 'm2.micro',
            Architecture: 'x86',
            Placement: {
              AvailabilityZone: `${r}-c`,
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
    this.mock
      .on(DescribeRegionsCommand)
      .resolves({
        Regions: [
          { RegionName: 'us-west-2' },
          { RegionName: 'us-east-1' },
          { RegionName: 'eu-central-1' },
        ],
      });
  }

  terminateInstances() {
    this.mock
      .on(TerminateInstancesCommand)
      .callsFake(({ InstanceIds }) => {
        return {
          TerminatingInstances: InstanceIds.map(InstanceId => {
            this.mock.terminatedInstances.push(InstanceId);
            return { InstanceId, CurrentState: { Name: 'shutting-down' } };
          }),
        };
      });
  }

  describeInstanceStatus() {
    this.mock
      .on(DescribeInstanceStatusCommand)
      .callsFake(({ InstanceIds }) => {
        return {
          InstanceStatuses: InstanceIds.map(InstanceId => {
            const state = this.mock.instanceStatuses[InstanceId];
            assert(state, `No value in instanceStatuses[${InstanceId}]`);
            return { InstanceState: { Name: state }, InstanceId };
          }),
        };
      });
  }
}
