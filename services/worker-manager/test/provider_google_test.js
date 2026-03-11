import taskcluster from '@taskcluster/client';
import { strict as assert } from 'assert';
import helper from './helper.js';
import { FakeGoogle } from './fakes/index.js';
import { GoogleProvider } from '../src/providers/google.js';
import testing from '@taskcluster/lib-testing';
import { WorkerPool, WorkerPoolError, Worker, WorkerPoolStats } from '../src/data.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.resetTables(mock, skipping);

  let provider;
  let providerId = 'google';
  let workerPoolId = 'foo/bar';
  const project = 'testy';

  const fake = new FakeGoogle;
  fake.forSuite();

  setup(async function() {
    provider = new GoogleProvider({
      providerId,
      notify: await helper.load('notify'),
      db: helper.db,
      monitor: (await helper.load('monitor')).childMonitor('google'),
      estimator: await helper.load('estimator'),
      publisher: await helper.load('publisher'),
      validator: await helper.load('validator'),
      launchConfigSelector: await helper.load('launchConfigSelector'),
      rootUrl: helper.rootUrl,
      WorkerPoolError: WorkerPoolError,
      providerConfig: {
        project,
        instancePermissions: [],
        creds: '{"client_id": "fake-creds"}',
        workerServiceAccountId: '12345',
        _backoffDelay: 1,
      },
    });

    await helper.db.fns.delete_worker_pool(workerPoolId);

    await provider.setup();
    provider.scanPrepare();
  });

  const defaultLaunchConfig = {
    workerManager: {
      capacityPerInstance: 1,
    },
    machineType: 'n1-standard-2',
    region: 'us-east1',
    zone: 'us-east1-a',
    workerConfig: {},
    scheduling: {},
    networkInterfaces: [],
    disks: [],
  };

  const makeWorker = async (overrides = {}) => {
    let worker = Worker.fromApi({
      ...overrides,
    });
    await worker.create(helper.db);

    return worker;
  };

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
        scalingRatio: 1,
        launchConfigs: [defaultLaunchConfig],
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
        validator: await helper.load('validator'),
        publisher: await helper.load('publisher'),
        rootUrl: helper.rootUrl,
        WorkerPoolError: helper.WorkerPoolError,
        launchConfigSelector: await helper.load('launchConfigSelector'),
        providerConfig: {
          project,
          instancePermissions: [],
          creds,
          workerServiceAccountId: '12345',
          _backoffDelay: 1,
        },
      });
    });
  };
  constructorTest('constructor with creds as object', { "client_id": "fake-creds" });
  constructorTest('constructor with creds as string', '{"client_id": "fake-creds"}');
  constructorTest('constructor with creds as base64', Buffer.from('{"client_id": "fake-creds"}', 'utf8').toString('base64'));

  suite('provisioning', function() {
    const provisionTest = (name, { config, expectedWorkers }, check) => {
      test(name, async function() {
        const workerPool = await makeWorkerPool({ config });
        const workerPoolStats = new WorkerPoolStats('wpid');
        await provider.provision({ workerPool, workerPoolStats });
        const workers = await helper.getWorkers();
        assert.equal(workers.length, expectedWorkers);
        await check(workers);
        if (expectedWorkers > 0) {
          helper.assertPulseMessage('worker-requested', m => m.payload.workerPoolId === workerPoolId);
          helper.assertPulseMessage('worker-requested', m => m.payload.workerId === workers[0].workerId);
          helper.assertPulseMessage('worker-requested', m => m.payload.launchConfigId === workers[0].launchConfigId);
        }
      });
    };

    const config = {
      minCapacity: 1,
      maxCapacity: 1,
      scalingRatio: 1,
      launchConfigs: [defaultLaunchConfig],
    };

    provisionTest('no launch configs', {
      config: { minCapacity: 0, maxCapacity: 1, scalingRatio: 1 },
      expectedWorkers: 0,
    }, async workers => {
      assert.equal(workers.length, 0);
    });

    provisionTest('simple success', {
      config,
      expectedWorkers: 1,
    }, async workers => {
      const worker = workers[0];

      assert.equal(worker.workerPoolId, workerPoolId, 'Worker was created for a wrong worker pool');
      assert.equal(worker.workerGroup, defaultLaunchConfig.zone, 'Worker group should be zone');
      assert.equal(worker.state, Worker.states.REQUESTED, 'Worker should be marked as requested');
      assert.equal(worker.providerData.zone, defaultLaunchConfig.zone, 'Zone should come from the chosen config');
      assert.deepEqual(worker.providerData.workerConfig, {});

      const parameters = fake.compute.instances.insertCalls[0];
      assert.equal(parameters.project, project);
      assert.equal(parameters.zone, defaultLaunchConfig.zone);
      assert.deepEqual(parameters.requestBody.labels, {
        'created-by': 'taskcluster-wm-' + providerId,
        'managed-by': 'taskcluster',
        'worker-pool-id': workerPoolId.replace('/', '-'),
        'owner': 'whatever-example-com',
        'launch-config-id': worker.launchConfigId,
      });
      assert.equal(parameters.requestBody.description, 'none');
      assert.deepEqual(parameters.requestBody.disks, []);
      assert.deepEqual(parameters.requestBody.serviceAccounts, [{
        email: 'testy-12345@example.com',
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      }]);
      assert.deepEqual(parameters.requestBody.scheduling, { automaticRestart: false });

      assert.equal(parameters.requestBody.metadata.items.length, 1);
      const meta = parameters.requestBody.metadata.items[0];
      assert.equal(meta.key, 'taskcluster');
      const tcmeta = JSON.parse(meta.value);
      assert.deepEqual(tcmeta, {
        workerPoolId,
        providerId,
        workerGroup: defaultLaunchConfig.zone,
        rootUrl: helper.rootUrl,
        workerConfig: {},
      });

      const instanceName = parameters.requestBody.name;
      assert(fake.compute.zoneOperations.fakeOperationExists(
        worker.providerData.operation));
      assert.equal(worker.workerId, `i-${instanceName}`);
    });

    provisionTest('registrationTimeout', {
      config: {
        ...config,
        lifecycle: {
          registrationTimeout: 6000,
        },
      },
      expectedWorkers: 1,
    }, async workers => {
      const worker = workers[0];
      // Check that this is setting times correctly to within a second or so to allow for some time
      // for the provisioning loop
      assert(worker.providerData.terminateAfter - new Date() - (6000 * 1000) < 5000);
    });

    provisionTest('queueInactivityTimeout', {
      config: {
        ...config,
        lifecycle: {
          queueInactivityTimeout: 600,
        },
      },
      expectedWorkers: 1,
    }, async workers => {
      const worker = workers[0];
      assert.equal(600000, worker.providerData.queueInactivityTimeout);
    });

    provisionTest('labels', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          labels: {
            color: 'red',
            owner: 'ignored',
          },
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.deepEqual(parameters.requestBody.labels, {
        'created-by': 'taskcluster-wm-' + providerId,
        'managed-by': 'taskcluster',
        'worker-pool-id': workerPoolId.replace('/', '-'),
        'owner': 'whatever-example-com',
        'color': 'red',
        'launch-config-id': workers[0].launchConfigId,
      });
    });

    provisionTest('disks (persistent)', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          disks: [{
            testProperty: 'bar',
            type: 'PERSISTENT',
            labels: { color: 'purple' },
          }],
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.deepEqual(parameters.requestBody.disks, [
        {
          testProperty: 'bar',
          type: 'PERSISTENT',
          initializeParams: {
            labels: {
              'created-by': 'taskcluster-wm-' + providerId,
              'managed-by': 'taskcluster',
              'worker-pool-id': workerPoolId.replace('/', '-'),
              'owner': 'whatever-example-com',
              'color': 'purple',
              'launch-config-id': workers[0].launchConfigId,
            },
          },
        },
      ]);
    });

    provisionTest('disks (scratch)', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          disks: [{
            testProperty: 'bar',
            type: 'SCRATCH',
            labels: { color: 'purple' },
          }],
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.deepEqual(parameters.requestBody.disks, [
        {
          testProperty: 'bar',
          type: 'SCRATCH',
        },
      ]);
    });

    provisionTest('disk labels preserved', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          disks: [{
            testProperty: 'bar',
            type: 'PERSISTENT',
            initializeParams: { labels: { color: 'purple' } },
          }],
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.deepEqual(parameters.requestBody.disks, [
        {
          testProperty: 'bar',
          type: 'PERSISTENT',
          initializeParams: {
            labels: {
              'created-by': 'taskcluster-wm-' + providerId,
              'managed-by': 'taskcluster',
              'worker-pool-id': workerPoolId.replace('/', '-'),
              'owner': 'whatever-example-com',
              'color': 'purple',
              'launch-config-id': workers[0].launchConfigId,
            },
          },
        },
      ]);
    });

    provisionTest('top-level launchConfig property', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          testProperty: 'foo',
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.equal(parameters.requestBody.testProperty, 'foo');
    });

    provisionTest('scheduling', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          scheduling: { testProperty: 'foo' },
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.equal(parameters.requestBody.scheduling.testProperty, 'foo');
    });

    provisionTest('extra metadata', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          metadata: {
            items: [
              { key: 'mystuff', value: 'foo' },
            ],
          },
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.equal(parameters.requestBody.metadata.items.length, 2);
      const meta = parameters.requestBody.metadata.items[0];
      assert.equal(meta.key, 'mystuff');
      assert.equal(meta.value, 'foo');
    });

    provisionTest('workerConfig', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          workerConfig: {
            slowRollTasks: true,
          },
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.equal(parameters.requestBody.metadata.items.length, 1);
      const meta = parameters.requestBody.metadata.items[0];
      assert.equal(meta.key, 'taskcluster');
      const tcmeta = JSON.parse(meta.value);
      assert.deepEqual(tcmeta.workerConfig, {
        slowRollTasks: true,
      });
    });

    test('failure from compute.insert', async function() {
      const workerPool = await makeWorkerPool();
      const workerPoolStats = new WorkerPoolStats('wpid');

      // replicate the shape of an error from the google API
      fake.compute.instances.failFakeInsertWith = fake.makeError('uhoh', 400);

      await provider.provision({ workerPool, workerPoolStats });
      const errors = await helper.db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, null, null);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].description, 'uhoh');
      const workers = await helper.getWorkers();
      assert.equal(workers.length, 0); // nothing created
    });

    test('rate-limiting from compute.insert', async function() {
      const workerPool = await makeWorkerPool();
      const workerPoolStats = new WorkerPoolStats('wpid');

      // replicate the shape of an error from the google API
      fake.compute.instances.failFakeInsertWith = fake.makeError('back off', 403);

      await provider.provision({ workerPool, workerPoolStats });

      const errors = await helper.db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, null, null);
      assert.equal(errors.length, 0);

      // called twice, retrying automatically
      assert.equal(fake.compute.instances.insertCalls.length, 2);

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1); // created a worker on retry
    });
  });

  test('deprovision', async function() {
    const workerPool = await makeWorkerPool({
      // simulate previous provisionig and deleting the workerpool
      providerId: 'null-provider',
      previousProviderIds: ['google'],
      providerData: { google: {} },
    });
    await provider.deprovision({ workerPool });
    // nothing has changed..
    assert(workerPool.previousProviderIds.includes('google'));
  });

  test('removeWorker', async function() {
    const workerId = '12345';
    const worker = await makeWorker({
      workerPoolId,
      workerGroup: 'us-east1-a',
      workerId,
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      expires: taskcluster.fromNow('90 seconds'),
      capacity: 1,
      state: 'requested',
      providerData: { zone: 'us-east1-a' },
      launchConfigId: 'lc-id-1',
    });
    await provider.removeWorker({ worker });
    assert(fake.compute.instances.delete_called);
    helper.assertPulseMessage('worker-removed', m => m.payload.workerId === workerId);
    helper.assertPulseMessage('worker-removed', m => m.payload.launchConfigId === worker.launchConfigId);
    assert.equal(worker.state, Worker.states.STOPPING);
  });

  suite('checkWorker', function() {
    const workerId = 'wkrid';
    const suiteMakeWorker = async (overrides) => {
      return await makeWorker({
        workerPoolId,
        workerGroup: 'us-east1-a',
        workerId,
        providerId,
        created: taskcluster.fromNow('-2 weeks'),
        lastModified: taskcluster.fromNow('-2 weeks'),
        lastChecked: taskcluster.fromNow('-2 weeks'),
        capacity: 1,
        expires: taskcluster.fromNow('2 weeks'),
        state: Worker.states.RUNNING,
        launchConfigId: 'lc1',
        ...overrides,
        providerData: { project, zone: 'us-east1-a', ...(overrides.providerData || {}) },
      });
    };

    const runCheckWorker = async worker => {
      await provider.scanPrepare();
      await provider.checkWorker({ worker });
      await provider.scanCleanup();
      await worker.reload(helper.db);
      return worker;
    };

    test('for a still-requested worker', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({ state: 'requested' });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker.created = taskcluster.fromNow('-10 minutes');
      worker = await runCheckWorker(worker);

      // RUNNING is set by register which does not happen here
      assert.equal(worker.state, Worker.states.REQUESTED);
    });

    test('for a running worker', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({ state: 'running' });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker.created = taskcluster.fromNow('-10 minutes');
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.RUNNING);
    });

    test('for a terminated instance', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({ state: 'running' });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'TERMINATED');
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === workerId);
      helper.assertPulseMessage('worker-stopped', m => m.payload.launchConfigId === worker.launchConfigId);
    });

    test('for a stopped instance', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({ state: 'running' });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'STOPPED');
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === workerId);
    });

    test('for a nonexistent instance', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({ state: 'requested' });
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === workerId);
    });

    test('for a nonexistent instance with a running operation', async function() {
      await makeWorkerPool();
      const operation = fake.compute.zoneOperations.fakeOperation({ zone: 'us-east1-a' });
      let worker = await suiteMakeWorker({ state: 'requested', providerData: { operation } });
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.REQUESTED);
      helper.assertNoPulseMessage('worker-stopped');
    });

    test('for a nonexistent instance with a failed operation', async function() {
      await makeWorkerPool();
      const operation = fake.compute.zoneOperations.fakeOperation({
        zone: 'us-east1-a',
        status: 'DONE',
        error: {
          errors: [{ message: 'uhoh' }],
        },
      });
      let worker = await suiteMakeWorker({ state: 'requested', providerData: { operation }, launchConfigId: 'lc1' });
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      const errors = await helper.db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, null, null);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].description, 'uhoh');
      assert.equal(errors[0].title, 'Operation Error');
      assert.equal(errors[0].launch_config_id, 'lc1');
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === workerId);
      helper.assertPulseMessage('worker-stopped', m => m.payload.launchConfigId === 'lc1');
    });

    test('remove unregistered workers after terminateAfter', async function() {
      const terminateAfter = Date.now() - 1000;
      let worker = await suiteMakeWorker({ providerData: { terminateAfter } });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      assert.equal(worker.state, Worker.states.RUNNING);
      worker = await runCheckWorker(worker);
      assert(fake.compute.instances.delete_called);

      // the worker is first marked as stopping
      // until we see it disappear, then stopped
      assert.equal(worker.state, Worker.states.STOPPING);
      helper.assertNoPulseMessage('worker-stopped');
      helper.assertPulseMessage('worker-removed', m => m.payload.workerId === workerId &&
        m.payload.reason === 'terminateAfter time exceeded');

      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === workerId);
    });

    test('don\'t remove unregistered before terminateAfter', async function() {
      const terminateAfter = Date.now() + 1000;
      let worker = await suiteMakeWorker({
        created: taskcluster.fromNow('-30 minutes'),
        providerData: { terminateAfter },
      });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker = await runCheckWorker(worker);
      assert(!fake.compute.instances.delete_called);
      assert.equal(worker.state, Worker.states.RUNNING);
      helper.assertNoPulseMessage('worker-stopped');
    });
    test('do not remove registered workers with stale terminateAfter', async function () {
      const terminateAfter = Date.now() - 1000;
      let worker = await suiteMakeWorker({
        created: taskcluster.fromNow('-30 minutes'),
        providerData: { terminateAfter },
      });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');

      worker.reload = function () {
        this.providerData.terminateAfter = Date.now() + 1000;
      };

      worker = await runCheckWorker(worker);
      assert(!fake.compute.instances.delete_called);
      assert.equal(worker.state, 'running');
    });
    test('remove zombie worker with no queue activity', async function () {
      const queueInactivityTimeout = 1;
      let worker = await suiteMakeWorker({ providerData: { queueInactivityTimeout } });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker.firstClaim = null;
      worker.lastDateActive = null;

      assert.equal(worker.state, Worker.states.RUNNING);
      worker = await runCheckWorker(worker);
      assert(fake.compute.instances.delete_called);
      assert.equal(worker.state, Worker.states.STOPPING);
      helper.assertNoPulseMessage('worker-stopped');
      helper.assertPulseMessage('worker-removed', m => m.payload.workerId === workerId &&
        m.payload.reason.includes('never claimed work'));

      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === workerId);
    });
    test('remove zombie worker that was active long ago', async function () {
      const queueInactivityTimeout = 120;
      let worker = await suiteMakeWorker({ providerData: { queueInactivityTimeout } });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');

      worker.created = taskcluster.fromNow('-120 minutes');
      worker.firstClaim = taskcluster.fromNow('-100 minutes');
      worker.lastDateActive = taskcluster.fromNow('-80 minutes');

      assert.equal(worker.state, Worker.states.RUNNING);
      worker = await runCheckWorker(worker);
      assert(fake.compute.instances.delete_called);
      assert.equal(worker.state, Worker.states.STOPPING);
      helper.assertNoPulseMessage('worker-stopped');
      helper.assertPulseMessage('worker-removed', m => m.payload.workerId === workerId &&
        m.payload.reason.includes('worker inactive'));

      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === workerId);
    });
    test('don\'t remove zombie worker that was recently active', async function () {
      const queueInactivityTimeout = 60 * 60 * 4 * 1000; // 4 hours
      let worker = await suiteMakeWorker({ providerData: { queueInactivityTimeout } });
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');

      worker.created = taskcluster.fromNow('-120 minutes');
      worker.firstClaim = taskcluster.fromNow('-100 minutes');
      worker.lastDateActive = taskcluster.fromNow('-80 minutes');

      worker = await runCheckWorker(worker);
      assert(!fake.compute.instances.delete_called);
      assert.equal(worker.state, Worker.states.RUNNING);
      helper.assertNoPulseMessage('worker-stopped');
      helper.assertNoPulseMessage('worker-removed');
    });
  });

  suite('registerWorker', function() {
    const workerGroup = 'us-east1-a';
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
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = {};
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /Token validation error/);
    });

    test('invalid token', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = { token: 'invalid' };
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /Token validation error/);
    });

    test('wrong project', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = { token: 'wrongProject' };
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /Token validation error/);
    });

    test('wrong sub', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = { token: 'wrongSub' };
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /Token validation error/);
    });

    test('wrong instance ID', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = { token: 'wrongId' };
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /Token validation error/);
    });

    test('wrong worker state (duplicate call to registerWorker)', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
        state: 'running',
      });
      const workerIdentityProof = { token: 'good' };
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /Token validation error/);
      helper.assertNoPulseMessage('worker-running');
    });

    test('sweet success', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const workerIdentityProof = { token: 'good' };
      const res = await provider.registerWorker({ workerPool, worker, workerIdentityProof });
      // allow +- 10 seconds since time passes while the test executes
      assert(res.expires - new Date() + 10000 > 96 * 3600 * 1000, res.expires);
      assert(res.expires - new Date() - 10000 < 96 * 3600 * 1000, res.expires);
      assert.equal(res.workerConfig.someKey, 'someValue');
      helper.assertPulseMessage('worker-running', m => m.payload.workerId === worker.workerId);
    });

    test('sweet success (different reregister)', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
        providerData: {
          reregistrationTimeout: 3600 * 10 * 1000,
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const workerIdentityProof = { token: 'good' };
      const res = await provider.registerWorker({ workerPool, worker, workerIdentityProof });
      // allow +- 10 seconds since time passes while the test executes
      assert(res.expires - new Date() + 10000 > 10 * 3600 * 1000, res.expires);
      assert(res.expires - new Date() - 10000 < 10 * 3600 * 1000, res.expires);
      assert.equal(res.workerConfig.someKey, 'someValue');
      helper.assertPulseMessage('worker-running', m => m.payload.workerId === worker.workerId);
      helper.assertPulseMessage('worker-running', m => m.payload.launchConfigId === worker.launchConfigId);
    });
  });
});
