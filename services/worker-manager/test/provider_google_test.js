const assert = require('assert');
const helper = require('./helper');
const {GoogleProvider} = require('../src/provider_google');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;
  let workerType;
  let providerName = 'google';
  let workerTypeName = 'foobar';

  setup(async function() {
    provider = new GoogleProvider({
      name: providerName,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('google'),
      provisionerId: 'whatever',
      estimator: await helper.load('estimator'),
      fake: true,
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
    });
    workerType = await helper.WorkerType.create({
      name: workerTypeName,
      provider: providerName,
      description: 'none',
      scheduledForDeletion: false,
      previousProviders: [],
      created: new Date(),
      lastModified: new Date(),
      config: {
        minCapacity: 1,
        maxCapacity: 1,
        capacityPerInstance: 1,
        machineType: 'n1-standard-2',
        regions: ['us-east1'],
        userData: {},
        scheduling: {},
        networkInterfaces: [],
        disks: [],
      },
      owner: 'whoever@example.com',
      providerData: {},
      wantsEmail: false,
    });
    await provider.setup();
  });

  test('something or other', async function() {
    await provider.provision({workerType});
    assert.equal(workerType.providerData.google.trackedOperations.length, 1);
    assert.equal(workerType.providerData.google.trackedOperations[0].name, 'foo');
    assert.equal(workerType.providerData.google.trackedOperations[0].zone, 'whatever/a');
    await provider.handleOperations({workerType});
    assert.equal(workerType.providerData.google.trackedOperations.length, 0);
  });
});
