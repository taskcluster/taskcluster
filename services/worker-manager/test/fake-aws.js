module.exports = {
  EC2: {
    runInstances: () => {
      const fake = launchConfig => {
        fake.calls.push({launchConfig});

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
      };

      fake.calls = [];

      return fake;
    },

    describeRegions: () => {
      return {
        promise: () => ({
          Regions: [
            {RegionName: 'us-west-2'},
            {RegionName: 'us-east-1'},
            {RegionName: 'eu-central-1'},
          ],
        }),
      };
    },

    terminateInstances: ({InstanceIds}) => {
      return {
        promise: () => ({
          TerminatingInstances: InstanceIds.map(iid => ({
            InstanceId: iid,
            CurrentState: {
              Name: 'shutting-down',
            },
          })),
        }),
      };
    },
  },
};
