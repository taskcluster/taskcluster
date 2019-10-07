const assert = require('assert');

module.exports = {
  EC2: {
    runInstances: ({defaultLaunchConfig, TagSpecifications, UserData}) => launchConfig => {
      assert.deepStrictEqual(launchConfig,
        {
          ...defaultLaunchConfig.launchConfig,
          MinCount: launchConfig.MinCount, // this is estimator's functionality, no need to test this here
          MaxCount: launchConfig.MaxCount,
          TagSpecifications,
          UserData: Buffer.from(JSON.stringify(UserData)).toString('base64'),
        }
      );

      let Instances = [];
      for (let i = 0; i < launchConfig.MinCount; i++) {
        Instances.push({
          InstanceId: `i-${i}`,
          AmiLaunchIndex: '',
          ImageId: launchConfig.ImageId,
          InstanceType: launchConfig.InstanceType || 'm2.micro',
          Architecture: 'x86',
          Placement: {
            AvailabilityZone: 'someregion',
          },
          PrivateIpAddress: '1.1.1.1',
          OwnerId: '123123123',
          State: {
            Name: 'running',
          },
          StateReason: {
            Message: 'yOu LaunCHed iT!!!1',
          },
        });
      }
      return {
        promise: () => ({
          Instances,
          Groups: [],
          OwnerId: '123123123',
        }),
      };
    },

    describeRegions: () => {
      return {
        promise: () => ({
            Regions: [
              {RegionName: 'us-west-2'},
              {RegionName: 'us-east-1'},
              {RegionName: 'eu-central-1'},
            ],
        })
      };
    },
  },
};
