let InstanceId = 0;

module.exports = {
  EC2: {
    runInstances: () => {
      const fake = launchConfig => {
        fake.calls.push({launchConfig});

        let Instances = [];
        for (let i = 0; i < launchConfig.MinCount; i++) {
          Instances.push({
            InstanceId: `i-${InstanceId++}`,
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

    terminateInstances: () => {
      const fake = ({InstanceIds}) => {
        fake.calls.push({InstanceIds});
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
      };
      fake.calls = [];
      return fake;
    },

    // to make this function return the status you want, pass it in as an instance id
    // in other words, make the status your workerId in the worker fixture
    describeInstanceStatus: options => ({
      promise: () => ({
        InstanceStatuses: [{
          InstanceState: {Name: options.InstanceIds[0]},
          InstanceId: 'dummy-worker',
        }],
      }),
    }),
  },
};
