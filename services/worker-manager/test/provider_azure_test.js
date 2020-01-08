const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const {FakeAzure} = require('./fake-azure');
const {AzureProvider} = require('../src/providers/azure');
const testing = require('taskcluster-lib-testing');
const fs = require('fs');
const path = require('path');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;
  let workerPool;
  let providerId = 'azure';
  let workerPoolId = 'foo/bar';
  let fakeAzure;

  let baseProviderData = {
    location: 'westus',
    vm: {
      location: 'westus',
      name: 'some vm',
    },
    disk: {
      location: 'westus',
      name: 'some disk',
    },
    nic: {
      location: 'westus',
      name: 'some nic',
    },
    ip: {
      location: 'westus',
      name: 'some ip',
    },
  };

  setup(async function() {
    fakeAzure = new FakeAzure();
    provider = new AzureProvider({
      providerId,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('azure'),
      estimator: await helper.load('estimator'),
      fakeCloudApis: {
        azure: fakeAzure,
      },
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {
        clientId: 'my client id',
        secret: 'my secret',
        domain: 'some azure domain',
        subscriptionId: 'a subscription id',
        resourceGroupName: 'my-resource-group',
        storageAccountName: 'storage123',
        subnetName: 'a-subnet',
        _backoffDelay: 1,
      },
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
        lifecycle: {
          registrationTimeout: 6000,
        },
        launchConfigs: [
          {
            capacityPerInstance: 1,
            location: 'westus',
            hardwareProfile: {
              vmSize: 'Basic_A2',
            },
          },
        ],
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
    });
    await provider.setup();
  });

  test('provisioning loop', async function() {
    const now = Date.now();
    await provider.provision({workerPool, existingCapacity: 0});
    const workers = await helper.Worker.scan({}, {});
    // Check that this is setting times correctly to within a second or so to allow for some time
    // for the provisioning loop
    assert(workers.entries[0].providerData.registrationExpiry - now - (6000 * 1000) < 5000);
    assert.equal(workers.entries[0].workerId, '123');
  });

  test('provisioning loop with failure', async function() {
    // The fake throws an error on the second call
    await provider.provision({workerPool, existingCapacity: 0});
    await provider.provision({workerPool, existingCapacity: 0});
    const errors = await helper.WorkerPoolError.scan({}, {});
    assert.equal(errors.entries.length, 1);
    assert.equal(errors.entries[0].description, 'something went wrong');
    const workers = await helper.Worker.scan({}, {});
    assert.equal(workers.entries.length, 1); // second loop should not have created one
  });

  test('provisioning loop with rate limiting', async function() {
    // Notice this is only three loops, but instance insert fails on third try before succeeding on 4th
    await provider.provision({workerPool, existingCapacity: 0});
    await provider.provision({workerPool, existingCapacity: 0});
    await provider.provision({workerPool, existingCapacity: 0});

    const workers = await helper.Worker.scan({}, {});
    assert.equal(workers.entries.length, 2);
  });

  test('de-provisioning loop', async function() {
    // simulate previous provisionig and deleting the workerpool
    await workerPool.modify(wp => {
      wp.providerId = 'null-provider';
      wp.previousProviderIds = ['azure'];

      return wp;
    });
    await provider.deprovision({workerPool});
    // nothing has changed..
    assert(workerPool.previousProviderIds.includes('azure'));
  });

  test('removeWorker', async function() {
    const workerId = '12345';
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'whatever',
      workerId,
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      expires: taskcluster.fromNow('90 seconds'),
      capacity: 1,
      state: 'requested',
      providerData: {
        ...baseProviderData,
      },
    });
    await provider.removeWorker({worker});
    assert(fakeAzure.deleteVMStub.called);
    assert(fakeAzure.deleteDiskStub.called);
    assert(fakeAzure.deleteIPStub.called);
    assert(fakeAzure.deleteNICStub.called);
  });

  test('custom data properly set', async function() {
    await provider.provision({workerPool, existingCapacity: 0});
  });

  test('worker-scan loop', async function() {
    await provider.provision({workerPool, existingCapacity: 0});
    const worker = await helper.Worker.load({
      workerPoolId: 'foo/bar',
      workerId: '123',
      workerGroup: 'azure',
    });

    assert.equal(worker.state, helper.Worker.states.REQUESTED);

    // On the first run we've faked that the instance is running
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await worker.reload();
    assert.equal(worker.state, helper.Worker.states.REQUESTED); // RUNNING is set by register which does not happen here

    // And now we fake it is stopped
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await worker.reload();
    assert.equal(worker.state, helper.Worker.states.STOPPED);
  });

  test('update long-running worker', async function() {
    const expires = taskcluster.fromNow('-1 week');
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'whatever',
      workerId: 'whatever',
      providerId,
      created: taskcluster.fromNow('-2 weeks'),
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      capacity: 1,
      expires,
      state: helper.Worker.states.RUNNING,
      providerData: {
        ...baseProviderData,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(worker.expires > expires);
  });

  test('remove unregistered workers', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'whatever',
      workerId: 'whatever',
      providerId,
      capacity: 1,
      created: taskcluster.fromNow('-1 hour'),
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      expires: taskcluster.fromNow('1 week'),
      state: helper.Worker.states.REQUESTED,
      providerData: {
        ...baseProviderData,
        registrationExpiry: Date.now() - 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(fakeAzure.deleteVMStub.called);
    assert(fakeAzure.deleteDiskStub.called);
    assert(fakeAzure.deleteIPStub.called);
    assert(fakeAzure.deleteNICStub.called);
  });

  test('don\'t remove unregistered workers that are new', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'whatever',
      workerId: 'whatever',
      providerId,
      created: taskcluster.fromNow('-1 hour'),
      expires: taskcluster.fromNow('1 week'),
      capacity: 1,
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      state: helper.Worker.states.REQUESTED,
      providerData: {
        ...baseProviderData,
        registrationExpiry: Date.now() + 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(!fakeAzure.deleteVMStub.called);
    assert(!fakeAzure.deleteDiskStub.called);
    assert(!fakeAzure.deleteIPStub.called);
    assert(!fakeAzure.deleteNICStub.called);
  });

  suite('registerWorker', function() {
    const workerGroup = providerId;
    const workerId = '5d06deb3-807b-46dd-aef5-78aaf9193f71';

    const defaultWorker = {
      workerPoolId,
      workerGroup,
      workerId,
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      capacity: 1,
      expires: taskcluster.fromNow('90 seconds'),
      state: 'requested',
      providerData: {
        ...baseProviderData,
      },
    };

    test('sweet success', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
      const workerIdentityProof = {document};
      const res = await provider.registerWorker({workerPool, worker, workerIdentityProof});
      // allow +- 10 seconds since time passes while the test executes
      assert(res.expires - new Date() + 10000 > 96 * 3600 * 1000, res.expires);
      assert(res.expires - new Date() - 10000 < 96 * 3600 * 1000, res.expires);
    });
  });
});
