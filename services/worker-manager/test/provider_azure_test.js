const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const {FakeAzure} = require('./fake-azure');
const {AzureProvider} = require('../src/providers/azure');
const monitorManager = require('../src/monitor');
const testing = require('taskcluster-lib-testing');
const forge = require('node-forge');
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
    // So that checked-in certs are still valid
    provider._now = () => taskcluster.fromNow('-10 years');
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

  test('remove very old workers', async function() {
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
        reregisterDeadline: Date.now() - 1000,
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

  test('don\'t remove current workers', async function() {
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
        reregisterDeadline: Date.now() + 1000,
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

    test('document is not a valid PKCS#7 message', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const document = 'this is not a valid PKCS#7 message';
      const workerIdentityProof = {document};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.error.includes('Too few bytes to read ASN.1 value.'));
    });

    test('document is empty', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const document = '';
      const workerIdentityProof = {document};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.error.includes('Too few bytes to parse DER.'));
    });

    test('message does not match signature', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      // this file is a version of `azure_signature_good` where vmId has been edited in the message
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_message_bad')).toString();
      const workerIdentityProof = {document};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.message.includes('Error verifying PKCS#7 message signature'));
    });

    test('malformed signature', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      // this file is a version of `azure_signature_good` where the message signature has been edited
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_bad')).toString();
      const workerIdentityProof = {document};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.message.includes('Error verifying PKCS#7 message signature'));
    });

    test('expired message', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
      const workerIdentityProof = {document};
      provider._now = () => new Date(); // The certs that are checked-in are old so they should be expired now
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.message.includes('Expired message'));
    });

    test('bad cert', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
      const workerIdentityProof = {document};

      // Here we replace the intermediate certs with nothing and show that this should reject
      const oldCaStore = provider.caStore;
      provider.caStore = forge.pki.createCaStore([]);

      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.message.includes('Error verifying certificate chain'));
      assert(monitorManager.messages[0].Fields.error.includes('Certificate is not trusted'));
      provider.caStore = oldCaStore;
    });

    test('wrong worker state (duplicate call to registerWorker)', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
        state: 'running',
      });
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
      const workerIdentityProof = {document};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.error.includes('already running'));
    });

    test('wrong instance ID', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
        workerId: 'wrongeb3-807b-46dd-aef5-78aaf9193f71',
      });
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
      const workerIdentityProof = {document};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Signature validation error/);
      assert(monitorManager.messages[0].Fields.message.includes('Encountered vmId mismatch'));
      assert.equal(monitorManager.messages[0].Fields.vmId, workerId);
      assert.equal(monitorManager.messages[0].Fields.workerId, 'wrongeb3-807b-46dd-aef5-78aaf9193f71');
    });

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

    test('sweet success (different reregister)', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
        providerData: {
          reregistrationDeadline: taskcluster.fromNow('10 hours'),
        },
      });
      const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
      const workerIdentityProof = {document};
      const res = await provider.registerWorker({workerPool, worker, workerIdentityProof});
      // allow +- 10 seconds since time passes while the test executes
      assert(res.expires - new Date() + 10000 > 10 * 3600 * 1000, res.expires);
      assert(res.expires - new Date() - 10000 < 10 * 3600 * 1000, res.expires);
    });
  });
});
