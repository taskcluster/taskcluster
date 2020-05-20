const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const {FakeAzure} = require('./fake-azure');
const {AzureProvider} = require('../src/providers/azure');
const testing = require('taskcluster-lib-testing');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const {WorkerPool} = require('../src/data');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.resetTables(mock, skipping);

  let provider;
  let providerId = 'azure';
  let workerPoolId = 'foo/bar';
  let fakeAzure;

  let baseProviderData = {
    location: 'westus',
    vm: {
      name: 'some vm',
    },
    disk: {
      name: 'some disk',
    },
    nic: {
      name: 'some nic',
    },
    ip: {
      name: 'some ip',
    },
  };

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  setup(async function() {
    fakeAzure = new FakeAzure();
    provider = new AzureProvider({
      providerId,
      notify: await helper.load('notify'),
      db: helper.db,
      monitor: (await helper.load('monitor')).childMonitor('azure'),
      estimator: await helper.load('estimator'),
      fakeCloudApis: {
        azure: fakeAzure,
      },
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
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

    await helper.db.fns.delete_worker_pool(workerPoolId);

    await provider.setup();
  });

  const makeWorkerPool = async (overrides = {}) => {
    let workerPool = WorkerPool.fromApi({
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
      ...overrides,
    });
    await workerPool.create(helper.db);

    return workerPool;
  };

  test('provisioning loop', async function() {
    const workerPool = await makeWorkerPool();
    const now = Date.now();
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    await provider.provision({workerPool, workerInfo});
    const workers = await helper.Worker.scan({}, {});
    // Check that this is setting times correctly to within a second or so to allow for some time
    // for the provisioning loop
    assert(workers.entries[0].providerData.terminateAfter - now - (6000 * 1000) < 5000);
    assert.equal(workers.entries[0].workerPoolId, workerPoolId);
    assert.equal(workers.entries[0].workerGroup, 'westus');
  });

  test('provisioning loop with failure', async function() {
    const workerPool = await makeWorkerPool();
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    await provider.provision({workerPool, workerInfo});
    await provider.provision({workerPool, workerInfo});

    const workers = await helper.Worker.scan({}, {});
    assert.equal(workers.entries.length, 2);

    const worker1 = workers.entries[0];
    const worker2 = workers.entries[1];

    await provider.scanPrepare();
    await provider.checkWorker({worker: worker1});
    await provider.checkWorker({worker: worker2});
    await provider.scanCleanup();

    assert.equal(worker1.state, 'requested');
    // The fake throws an error on the second call
    assert.equal(worker2.state, 'stopping');
  });

  test('de-provisioning loop', async function() {
    const workerPool = await makeWorkerPool({
      // simulate previous provisionig and deleting the workerpool
      providerId: 'null-provider',
      previousProviderIds: ['azure'],
    });
    await provider.deprovision({workerPool});
    // nothing has changed..
    assert(workerPool.previousProviderIds.includes('azure'));
  });

  // See https://bugzilla.mozilla.org/show_bug.cgi?id=1624719
  test.skip('removeWorker deletes VM if it exists and has an id', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'westus',
      workerId: 'whatever',
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      expires: taskcluster.fromNow('90 seconds'),
      capacity: 1,
      state: 'requested',
      providerData: {
        ...baseProviderData,
        vm: {
          name: baseProviderData.vm.name,
          id: 'some-id',
        },
      },
    });
    await provider.removeWorker({worker});
    assert(fakeAzure.deleteVMStub.called);
    assert(!worker.providerData.vm.id);
  });

  test('checkWorker calls removeWorker() if worker is stopping', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'westus',
      workerId: 'whatever',
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      expires: taskcluster.fromNow('90 seconds'),
      capacity: 1,
      state: 'stopping',
      providerData: {
        ...baseProviderData,
        nic: {
          name: baseProviderData.nic.name,
          id: 'some-id',
        },
      },
    });
    // so that we hit the 404 condition in removeWorker() on the next call
    await fakeAzure.getVMStub();
    await fakeAzure.getVMStub();

    await provider.removeWorker({worker});

    // only deleting NIC on this iteration
    // because VM is faked as already deleted
    // and other deletions are future iterations
    assert(!fakeAzure.deleteVMStub.called);
    assert(fakeAzure.deleteNICStub.called);
    assert(!fakeAzure.deleteIPStub.called);
    assert(!fakeAzure.deleteDiskStub.called);
  });

  test('worker-scan loop', async function() {
    const workerPool = await makeWorkerPool();
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    await provider.provision({workerPool, workerInfo});
    const workers = await helper.Worker.scan({}, {});
    const worker = workers.entries[0];

    assert.equal(worker.state, helper.Worker.states.REQUESTED);

    // On the first run we've faked that the instance is running
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await worker.reload();
    assert.equal(worker.state, helper.Worker.states.REQUESTED); // RUNNING is set by register which does not happen here

    // And now we fake it is stopping
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await worker.reload();
    assert.equal(worker.state, helper.Worker.states.STOPPING);
  });

  test('update long-running worker', async function() {
    const expires = taskcluster.fromNow('-1 week');
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'westus',
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
      workerGroup: 'westus',
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
        vm: {
          name: baseProviderData.vm.name,
          id: 'some-id',
        },
        terminateAfter: Date.now() - 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(fakeAzure.deleteVMStub.called);
  });

  test('don\'t remove unregistered workers that are new', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'westus',
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
        terminateAfter: Date.now() + 1000,
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
      workerGroup: 'westus',
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
        vm: {
          name: baseProviderData.vm.name,
          id: 'some-id',
        },
        terminateAfter: Date.now() - 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(fakeAzure.deleteVMStub.called);
  });

  test('don\'t remove current workers', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'westus',
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
        terminateAfter: Date.now() + 1000,
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
    const workerGroup = 'westus';
    const vmId = '5d06deb3-807b-46dd-aef5-78aaf9193f71';
    const baseWorker = {
      workerPoolId,
      workerGroup,
      workerId: 'some-vm',
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      capacity: 1,
      expires: taskcluster.fromNow('90 seconds'),
      state: 'requested',
      providerData: {
        ...baseProviderData,
        vm: {
          name: 'some-vm',
          vmId: vmId,
        },
      },
    };

    for (const {name, defaultWorker} of [
      {name: 'pre-IDd', defaultWorker: baseWorker},
      {
        name: 'fetch-in-register',
        defaultWorker: {
          ...baseWorker,
          providerData: {
            ...baseProviderData,
            vm: {
              name: 'some-vm',
            },
          },
        },
      },
    ]) {
      suite(name, function() {
        test('document is not a valid PKCS#7 message', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
          });
          const document = 'this is not a valid PKCS#7 message';
          const workerIdentityProof = {document};
          await assert.rejects(() =>
            provider.registerWorker({workerPool, worker, workerIdentityProof}),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.error.includes('Too few bytes to read ASN.1 value.'));
        });

        test('document is empty', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
          });
          const document = '';
          const workerIdentityProof = {document};
          await assert.rejects(() =>
            provider.registerWorker({workerPool, worker, workerIdentityProof}),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.error.includes('Too few bytes to parse DER.'));
        });

        test('message does not match signature', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
          });
          // this file is a version of `azure_signature_good` where vmId has been edited in the message
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_message_bad')).toString();
          const workerIdentityProof = {document};
          await assert.rejects(() =>
            provider.registerWorker({workerPool, worker, workerIdentityProof}),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.message.includes('Error verifying PKCS#7 message signature'));
        });

        test('malformed signature', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
          });
          // this file is a version of `azure_signature_good` where the message signature has been edited
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_bad')).toString();
          const workerIdentityProof = {document};
          await assert.rejects(() =>
            provider.registerWorker({workerPool, worker, workerIdentityProof}),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.message.includes('Error verifying PKCS#7 message signature'));
        });

        test('expired message', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
          });
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
          const workerIdentityProof = {document};
          provider._now = () => new Date(); // The certs that are checked-in are old so they should be expired now
          await assert.rejects(() =>
            provider.registerWorker({workerPool, worker, workerIdentityProof}),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.message.includes('Expired message'));
        });

        test('bad cert', async function() {
          const workerPool = await makeWorkerPool();
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
          assert(monitor.manager.messages[0].Fields.message.includes('Error verifying certificate chain'));
          assert(monitor.manager.messages[0].Fields.error.includes('Certificate is not trusted'));
          provider.caStore = oldCaStore;
        });

        test('wrong worker state (duplicate call to registerWorker)', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
            state: 'running',
          });
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
          const workerIdentityProof = {document};
          await assert.rejects(() =>
            provider.registerWorker({workerPool, worker, workerIdentityProof}),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.error.includes('already running'));
        });

        test('wrong vmID', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
            providerData: {
              ...baseProviderData,
              vm: {
                name: baseProviderData.vm.name,
                vmId: 'wrongeba3-807b-46dd-aef5-78aaf9193f71',
              },
            },
          });
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
          const workerIdentityProof = {document};
          await assert.rejects(() =>
            provider.registerWorker({workerPool, worker, workerIdentityProof}),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.message.includes('vmId mismatch'));
          assert.equal(monitor.manager.messages[0].Fields.vmId, vmId);
          assert.equal(monitor.manager.messages[0].Fields.expectedVmId, 'wrongeba3-807b-46dd-aef5-78aaf9193f71');
          assert.equal(monitor.manager.messages[0].Fields.workerId, 'some-vm');
        });

        test('sweet success', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
            providerData: {
              ...defaultWorker.providerData,
              workerConfig: {
                "someKey": "someValue",
              },
            },
          });
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
          const workerIdentityProof = {document};
          const res = await provider.registerWorker({workerPool, worker, workerIdentityProof});
          // allow +- 10 seconds since time passes while the test executes
          assert(res.expires - new Date() + 10000 > 96 * 3600 * 1000, res.expires);
          assert(res.expires - new Date() - 10000 < 96 * 3600 * 1000, res.expires);
          assert.equal(res.workerConfig.someKey, 'someValue');
        });

        test('sweet success (different reregister)', async function() {
          const workerPool = await makeWorkerPool();
          const worker = await helper.Worker.create({
            ...defaultWorker,
            providerData: {
              ...defaultWorker.providerData,
              workerConfig: {
                "someKey": "someValue",
              },
            },
          });
          await worker.modify(w => {
            w.providerData.reregistrationTimeout = 10 * 3600 * 1000;
          });
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good')).toString();
          const workerIdentityProof = {document};
          const res = await provider.registerWorker({workerPool, worker, workerIdentityProof});
          // allow +- 10 seconds since time passes while the test executes
          assert(res.expires - new Date() + 10000 > 10 * 3600 * 1000, res.expires);
          assert(res.expires - new Date() - 10000 < 10 * 3600 * 1000, res.expires);
          assert.equal(res.workerConfig.someKey, 'someValue');
        });
      });
    }
  });
});
