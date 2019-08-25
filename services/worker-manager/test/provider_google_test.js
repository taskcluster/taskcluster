const taskcluster = require('taskcluster-client');
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
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {
        project: 'testy',
        instancePermissions: [],
        creds: '{}',
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
        capacityPerInstance: 1,
        machineType: 'n1-standard-2',
        regions: ['us-east1'],
        workerConfig: {},
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

  test('provisioning loop with failure', async function() {
    // The fake throws an error on the second call
    await provider.provision({workerPool});
    await provider.provision({workerPool});
    const errors = await helper.WorkerPoolError.scan({}, {});
    assert.equal(errors.entries.length, 1);
    assert.equal(errors.entries[0].description, 'something went wrong');
    const workers = await helper.Worker.scan({}, {});
    assert.equal(workers.entries.length, 1); // second loop should not have created one
  });

  test('de-provisioning loop', async function() {
    // simulate previous provisionig and deleting the workerpool
    await workerPool.modify(wp => {
      wp.providerId = 'null-provider';
      wp.previousProviderIds = ['google'];
      wp.providerData.google = {};
      return wp;
    });
    await provider.deprovision({workerPool});
    // nothing has changed..
    assert(workerPool.previousProviderIds.includes('google'));
  });

  test('removeResources', async function() {
    await workerPool.modify(wp => {
      wp.providerData.google = {};
      return wp;
    });
    await provider.removeResources({workerPool});
    assert(!workerPool.providerData.google);
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

  suite('registerWorker', function() {
    const workerGroup = providerId;
    const workerId = 'abc123';

    const defaultWorker = {
      workerPoolId,
      workerGroup,
      workerId,
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      expires: taskcluster.fromNow('90 seconds'),
      state: 'requested',
      providerData: {},
    };

    test('no token', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('invalid token', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'invalid'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong project', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongProject'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong project', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongSub'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong instance ID', async function() {
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongId'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong worker state (duplicate call to registerWorker)', async function() {
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
      const worker = await helper.Worker.create({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'good'};
      const res = await provider.registerWorker({workerPool, worker, workerIdentityProof});
      // allow +- 10 seconds since time passes while the test executes
      assert(res.expires - new Date() + 10000 > 96 * 3600 * 1000, res.expires);
      assert(res.expires - new Date() - 10000 < 96 * 3600 * 1000, res.expires);
    });
  });
});
