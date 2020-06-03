const taskcluster = require('taskcluster-client');
const sinon = require('sinon');
const assert = require('assert');
const helper = require('./helper');
const {FakeGoogle} = require('./fakes');
const {GoogleProvider} = require('../src/providers/google');
const testing = require('taskcluster-lib-testing');
const {WorkerPool} = require('../src/data');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.resetTables(mock, skipping);

  let provider;
  let providerId = 'google';
  let workerPoolId = 'foo/bar';

  const fake = new FakeGoogle;
  fake.forSuite();

  setup(async function() {
    provider = new GoogleProvider({
      providerId,
      notify: await helper.load('notify'),
      db: helper.db,
      monitor: (await helper.load('monitor')).childMonitor('google'),
      estimator: await helper.load('estimator'),
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {
        project: 'testy',
        instancePermissions: [],
        creds: '{"client_id": "fake-creds"}',
        workerServiceAccountId: '12345',
        _backoffDelay: 1,
      },
    });

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
            machineType: 'n1-standard-2',
            region: 'us-east1',
            zone: 'us-east1-a',
            workerConfig: {},
            scheduling: {},
            networkInterfaces: [],
            disks: [],
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

  const constructorTest = (name, creds) => {
    test(name, async function() {
      // this just has to not fail -- the google.auth.fromJSON call will fail if the creds
      // are malformed
      new GoogleProvider({
        providerId,
        notify: await helper.load('notify'),
        db: helper.db,
        monitor: (await helper.load('monitor')).childMonitor('google'),
        estimator: await helper.load('estimator'),
        rootUrl: helper.rootUrl,
        Worker: helper.Worker,
        WorkerPoolError: helper.WorkerPoolError,
        providerConfig: {
          project: 'testy',
          instancePermissions: [],
          creds,
          workerServiceAccountId: '12345',
          _backoffDelay: 1,
        },
      });
    });
  };
  constructorTest('constructor with creds as object', {"client_id": "fake-creds"});
  constructorTest('constructor with creds as string', '{"client_id": "fake-creds"}');
  constructorTest('constructor with creds as base64', Buffer.from('{"client_id": "fake-creds"}', 'utf8').toString('base64'));

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
    assert.deepEqual(workers.entries[0].providerData.operation, {
      name: 'foo',
      zone: 'whatever/a',
    });
    // TODO: check that the metadata in the compute.instance.insert call has correct properties
    // https://github.com/taskcluster/taskcluster/issues/2827
  });

  test('provisioning loop with failure', async function() {
    const workerPool = await makeWorkerPool();
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    // The fake throws an error on the second call
    await provider.provision({workerPool, workerInfo});
    await provider.provision({workerPool, workerInfo});
    const errors = await helper.WorkerPoolError.scan({}, {});
    assert.equal(errors.entries.length, 1);
    assert.equal(errors.entries[0].description, 'something went wrong');
    const workers = await helper.Worker.scan({}, {});
    assert.equal(workers.entries.length, 1); // second loop should not have created one
  });

  test('provisioning loop with rate limiting', async function() {
    const workerPool = await makeWorkerPool();
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    // Notice this is only three loops, but instance insert fails on third try before succeeding on 4th
    await provider.provision({workerPool, workerInfo});
    await provider.provision({workerPool, workerInfo});
    await provider.provision({workerPool, workerInfo});

    const workers = await helper.Worker.scan({}, {});
    assert.equal(workers.entries.length, 2);
  });

  test('de-provisioning loop', async function() {
    const workerPool = await makeWorkerPool({
      // simulate previous provisionig and deleting the workerpool
      providerId: 'null-provider',
      previousProviderIds: ['google'],
      providerData: {google: {}},
    });
    await provider.deprovision({workerPool});
    // nothing has changed..
    assert(workerPool.previousProviderIds.includes('google'));
  });

  test('removeResources', async function() {
    const workerPool = await makeWorkerPool({
      providerData: {google: {}},
    });
    await provider.removeResources({workerPool});
    assert.deepEqual(workerPool.providerData.google, {});
  });

  test('removeWorker', async function() {
    const workerId = '12345';
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'us-east1',
      workerId,
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      expires: taskcluster.fromNow('90 seconds'),
      capacity: 1,
      state: 'requested',
      providerData: {zone: 'us-east1-a'},
    });
    await provider.removeWorker({worker});
    assert(fake.compute.instances.delete_called);
  });

  test('worker-scan loop', async function() {
    const workerPool = await makeWorkerPool();
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    await provider.provision({workerPool, workerInfo});
    const worker = await helper.Worker.load({
      workerPoolId: 'foo/bar',
      workerId: '123',
      workerGroup: 'us-east1',
    });

    assert(worker.providerData.operation);
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
      workerGroup: 'us-east1',
      workerId: 'whatever',
      providerId,
      created: taskcluster.fromNow('-2 weeks'),
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      capacity: 1,
      expires,
      state: helper.Worker.states.RUNNING,
      providerData: {zone: 'us-east1-a'},
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(worker.expires > expires);
  });

  test('remove unregistered workers', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'us-east1',
      workerId: 'whatever',
      providerId,
      capacity: 1,
      created: taskcluster.fromNow('-1 hour'),
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      expires: taskcluster.fromNow('1 week'),
      state: helper.Worker.states.REQUESTED,
      providerData: {
        zone: 'us-east1-a',
        terminateAfter: Date.now() - 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(fake.compute.instances.delete_called);
  });

  test('don\'t remove unregistered workers that are new', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'us-east1',
      workerId: 'whatever',
      providerId,
      created: taskcluster.fromNow('-1 hour'),
      expires: taskcluster.fromNow('1 week'),
      capacity: 1,
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      state: helper.Worker.states.REQUESTED,
      providerData: {
        zone: 'us-east1-a',
        terminateAfter: Date.now() + 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(!fake.compute.instances.delete_called);
  });

  test('remove very old workers', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'us-east1',
      workerId: 'whatever',
      providerId,
      capacity: 1,
      created: taskcluster.fromNow('-1 hour'),
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      expires: taskcluster.fromNow('1 week'),
      state: helper.Worker.states.REQUESTED,
      providerData: {
        zone: 'us-east1-a',
        terminateAfter: Date.now() - 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(fake.compute.instances.delete_called);
  });

  test('don\'t remove current workers', async function() {
    const worker = await helper.Worker.create({
      workerPoolId,
      workerGroup: 'us-east1',
      workerId: 'whatever',
      providerId,
      capacity: 1,
      created: taskcluster.fromNow('-1 hour'),
      lastModified: taskcluster.fromNow('-2 weeks'),
      lastChecked: taskcluster.fromNow('-2 weeks'),
      expires: taskcluster.fromNow('1 week'),
      state: helper.Worker.states.REQUESTED,
      providerData: {
        zone: 'us-east1-a',
        terminateAfter: Date.now() + 1000,
      },
    });
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert(!fake.compute.instances.delete_called);
  });

  suite('_enqueue p-queues', function() {
    test('non existing queue', async function() {
      try {
        await provider._enqueue('nonexisting', () => {});
      } catch (err) {
        assert.equal(err.message, 'Unknown p-queue attempted: nonexisting');
        return;
      }
      throw new Error('should have thrown an error');
    });

    test('simple', async function() {
      const result = await provider._enqueue('query', () => 5);
      assert.equal(result, 5);
    });

    test('one 500', async function() {
      const remote = sinon.stub();
      remote.onCall(0).throws({code: 500});
      remote.onCall(1).returns(10);
      const result = await provider._enqueue('query', () => remote());
      assert.equal(result, 10);
      assert.equal(remote.callCount, 2);
    });
    test('multiple 500', async function() {
      const remote = sinon.stub();
      remote.onCall(0).throws({code: 500});
      remote.onCall(1).throws({code: 520});
      remote.onCall(2).throws({code: 503});
      remote.onCall(3).returns(15);
      const result = await provider._enqueue('query', () => remote());
      assert.equal(result, 15);
      assert.equal(remote.callCount, 4);
    });
    test('500s forever should throw', async function() {
      const remote = sinon.stub();
      remote.throws({code: 500});

      try {
        await provider._enqueue('query', () => remote());
      } catch (err) {
        assert.deepEqual(err, {code: 500});
        return;
      }
      assert.equal(remote.callCount, 5);
      throw new Error('should have thrown an error');
    });
  });

  suite('registerWorker', function() {
    const workerGroup = 'us-east1';
    const workerId = 'abc123';

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
      providerData: {},
    };

    test('no token', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('invalid token', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'invalid'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong project', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongProject'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong sub', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongSub'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong instance ID', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongId'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong worker state (duplicate call to registerWorker)', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await helper.Worker.create({
        ...defaultWorker,
        state: 'running',
      });
      const workerIdentityProof = {token: 'good'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('sweet success', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await helper.Worker.create({
        ...defaultWorker,
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const workerIdentityProof = {token: 'good'};
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
          reregistrationTimeout: 3600 * 10 * 1000,
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const workerIdentityProof = {token: 'good'};
      const res = await provider.registerWorker({workerPool, worker, workerIdentityProof});
      // allow +- 10 seconds since time passes while the test executes
      assert(res.expires - new Date() + 10000 > 10 * 3600 * 1000, res.expires);
      assert(res.expires - new Date() - 10000 < 10 * 3600 * 1000, res.expires);
      assert.equal(res.workerConfig.someKey, 'someValue');
    });
  });
});
