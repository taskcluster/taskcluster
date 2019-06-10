const assert = require('assert');
const helper = require('./helper');
const {FakeGoogle} = require('./fake-google');
const {GoogleProvider} = require('../src/providers/google');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;
  let workerPool;
  let providerId = 'google';
  let workerPoolId = 'foo/bar';

  setup(async function() {
    provider = new GoogleProvider({
      providerId,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('google'),
      estimator: await helper.load('estimator'),
      fakeCloudApis: {
        google: new FakeGoogle(),
      },
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
    });
    workerPool = await helper.WorkerPool.create({
      workerPoolId,
      providerId,
      description: 'none',
      previousProviderIds: [],
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
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
    });
    await provider.setup();
  });

  test('provisioning loop', async function() {
    await provider.provision({workerPool});
    const workers = await helper.Worker.scan({}, {});
    assert.deepEqual(workers.entries[0].providerData.operation, {
      name: 'foo',
      zone: 'whatever/a',
    });
  });

  test('worker-scan loop', async function() {
    await provider.provision({workerPool});
    const worker = await helper.Worker.load({
      workerPoolId: 'foo/bar',
      workerId: '123',
      workerGroup: 'google',
    });

    assert(worker.providerData.operation);

    // On the first run we've faked that the instance is running
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await workerPool.reload();
    assert.equal(workerPool.providerData.google.running, 1);
    worker.reload();
    assert(worker.providerData.operation);

    // And now we fake it is stopped
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await workerPool.reload();
    assert.equal(workerPool.providerData.google.running, 0);
    worker.reload();
    assert(worker.providerData.operation);
  });
});
