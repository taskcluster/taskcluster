const {AWS_API_VERSION} = require('../src/constants');
const assert = require('assert');
const sinon = require('sinon');
const helper = require('./helper');
const {AwsProvider} = require('../src/providers/aws');
const testing = require('taskcluster-lib-testing');
const aws = require('aws-sdk');
const fakeAWS = require('./fake-aws');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;
  const providerId = 'aws';
  const workerPoolId = 'foo/bar';
  const defaultLaunchConfig = {
    region: 'us-west-2',
    capacityPerInstance: 1,
    launchConfig: {
      ImageId: 'banana-123',
    },
    minCapacity: 1,
    maxCapacity: 2,
  };
  let workerPool = {
    workerPoolId,
    providerId,
    description: 'none',
    previousProviderIds: [],
    created: new Date(),
    lastModified: new Date(),
    config: {
      launchConfigs: [
        defaultLaunchConfig,
      ],
    },
    owner: 'whatever@example.com',
    providerData: {},
    emailOnError: false,
  };
  const TagSpecifications = [
    ...(defaultLaunchConfig.launchConfig.TagSpecifications ? defaultLaunchConfig.launchConfig.TagSpecifications : []),
    {
      ResourceType: 'instance',
      Tags: [
        {
          Key: 'Provider',
          Value: `wm-${providerId}`,
        }, {
          Key: 'Owner',
          Value: workerPool.owner,
        }],
    },
  ];
  const UserData = {
    rootUrl: helper.rootUrl,
    workerPoolId,
    providerId,
    workerGroup: providerId,
  };

  setup(async function() {
    provider = new AwsProvider({
      providerId,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('aws'),
      estimator: await helper.load('estimator'),
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {
        providerType: 'aws',
        credentials: {
          accessKeyId: 'accesskeyid',
          secretAccessKey: 'topsecret',
        },
      },
    });

    workerPool = await helper.WorkerPool.create(workerPool);

    await provider.setup();
  });

  test('provisioning loop', async function() {
    sinon.stub(aws, 'EC2')
      .withArgs({
        apiVersion: AWS_API_VERSION,
        credentials: provider.providerConfig.credentials,
        region: defaultLaunchConfig.region,
      }).returns({
        runInstances: fakeAWS.EC2.runInstances({defaultLaunchConfig, TagSpecifications, UserData}),
      });

    await provider.provision({workerPool});
    const workers = await helper.Worker.scan({}, {});

    workers.entries.forEach(w => {
      assert.strictEqual(w.workerPoolId, workerPoolId, 'Worker was created for a wrong worker pool');
      assert.strictEqual(w.workerGroup, providerId, 'Worker group id should be the same as provider id');
      assert.strictEqual(w.state, helper.Worker.states.REQUESTED, 'Worker should be marked as requested');
      assert.strictEqual(w.providerData.region, defaultLaunchConfig.region, 'Region should come from the chosen config');
    });
    sinon.restore();
  });
});
