const taskcluster = require('taskcluster-client');
const assert = require('assert').strict;
const helper = require('./helper');
const {FakeGoogle} = require('./fakes');
const {GoogleProvider} = require('../src/providers/google');
const testing = require('taskcluster-lib-testing');
const {WorkerPool, Worker} = require('../src/data');

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
      rootUrl: helper.rootUrl,
      WorkerPoolError: helper.WorkerPoolError,
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
  });

  const defaultLaunchConfig = {
    capacityPerInstance: 1,
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
        rootUrl: helper.rootUrl,
        WorkerPoolError: helper.WorkerPoolError,
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
  constructorTest('constructor with creds as object', {"client_id": "fake-creds"});
  constructorTest('constructor with creds as string', '{"client_id": "fake-creds"}');
  constructorTest('constructor with creds as base64', Buffer.from('{"client_id": "fake-creds"}', 'utf8').toString('base64'));

  suite('provisioning', function() {
    const provisionTest = (name, {config, expectedWorkers}, check) => {
      test(name, async function() {
        const workerPool = await makeWorkerPool({config});
        const workerInfo = {existingCapacity: 0, requestedCapacity: 0};
        await provider.provision({workerPool, workerInfo});
        const workers = await Worker.getWorkers(helper.db, {});
        assert.equal(workers.rows.length, expectedWorkers);
        await check(workers);
      });
    };

    const config = {
      minCapacity: 1,
      maxCapacity: 1,
      launchConfigs: [defaultLaunchConfig],
    };

    provisionTest('simple success', {
      config,
      expectedWorkers: 1,
    }, async workers => {
      const worker = workers.rows[0];

      assert.equal(worker.workerPoolId, workerPoolId, 'Worker was created for a wrong worker pool');
      assert.equal(worker.workerGroup, defaultLaunchConfig.region, 'Worker group should be region');
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
      });
      assert.equal(parameters.requestBody.description, 'none');
      assert.deepEqual(parameters.requestBody.disks, []);
      assert.deepEqual(parameters.requestBody.serviceAccounts, [{
        email: 'testy-12345@example.com',
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      }]);
      assert.deepEqual(parameters.requestBody.scheduling, {automaticRestart: false});

      assert.equal(parameters.requestBody.metadata.items.length, 1);
      const meta = parameters.requestBody.metadata.items[0];
      assert.equal(meta.key, 'taskcluster');
      const tcmeta = JSON.parse(meta.value);
      assert.deepEqual(tcmeta, {
        workerPoolId,
        providerId,
        workerGroup: defaultLaunchConfig.region,
        rootUrl: helper.rootUrl,
        workerConfig: {},
      });

      const instanceName = parameters.requestBody.name;
      assert(fake.compute.zoneOperations.fakeOperationExists(
        worker.providerData.operation));
      assert.equal(worker.workerId, `instance-${instanceName}`);
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
      const worker = workers.rows[0];
      // Check that this is setting times correctly to within a second or so to allow for some time
      // for the provisioning loop
      assert(worker.providerData.terminateAfter - new Date() - (6000 * 1000) < 5000);
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
      });
    });

    provisionTest('disks', {
      config: {
        ...config,
        launchConfigs: [{
          ...defaultLaunchConfig,
          disks: [{testProperty: 'bar', labels: {color: 'purple'}}],
        }],
      },
      expectedWorkers: 1,
    }, async workers => {
      const parameters = fake.compute.instances.insertCalls[0];
      assert.deepEqual(parameters.requestBody.disks, [
        {
          testProperty: 'bar',
          labels: {
            'created-by': 'taskcluster-wm-' + providerId,
            'managed-by': 'taskcluster',
            'worker-pool-id': workerPoolId.replace('/', '-'),
            'owner': 'whatever-example-com',
            'color': 'purple',
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
          scheduling: {testProperty: 'foo'},
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
              {key: 'mystuff', value: 'foo'},
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
      const workerInfo = {existingCapacity: 0, requestedCapacity: 0};

      // replicate the shape of an error from the google API
      fake.compute.instances.failFakeInsertWith = fake.makeError('uhoh', 400);

      await provider.provision({workerPool, workerInfo});
      const errors = await helper.WorkerPoolError.scan({}, {});
      assert.equal(errors.entries.length, 1);
      assert.equal(errors.entries[0].description, 'uhoh');
      const workers = await Worker.getWorkers(helper.db, {});
      assert.equal(workers.rows.length, 0); // nothing created
    });

    test('rate-limiting from compute.insert', async function() {
      const workerPool = await makeWorkerPool();
      const workerInfo = {existingCapacity: 0, requestedCapacity: 0};

      // replicate the shape of an error from the google API
      fake.compute.instances.failFakeInsertWith = fake.makeError('back off', 403);

      await provider.provision({workerPool, workerInfo});

      const errors = await helper.WorkerPoolError.scan({}, {});
      assert.equal(errors.entries.length, 0);

      // called twice, retrying automatically
      assert.equal(fake.compute.instances.insertCalls.length, 2);

      const workers = await Worker.getWorkers(helper.db, {});
      assert.equal(workers.rows.length, 1); // created a worker on retry
    });
  });

  test('deprovision', async function() {
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
    // nothing has changed..
    assert.deepEqual(workerPool.providerData.google, {});
  });

  test('removeWorker', async function() {
    const workerId = '12345';
    const worker = await makeWorker({
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

  suite('checkWorker', function() {
    const workerId = 'wkrid';
    const suiteMakeWorker = async (overrides) => {
      return await makeWorker({
        workerPoolId,
        workerGroup: 'us-east1',
        workerId,
        providerId,
        created: taskcluster.fromNow('-2 weeks'),
        lastModified: taskcluster.fromNow('-2 weeks'),
        lastChecked: taskcluster.fromNow('-2 weeks'),
        capacity: 1,
        expires: taskcluster.fromNow('2 weeks'),
        state: Worker.states.RUNNING,
        ...overrides,
        providerData: {project, zone: 'us-east1-a', ...overrides.providerData || {}},
      });
    };

    const runCheckWorker = async worker => {
      await provider.scanPrepare();
      await provider.checkWorker({worker});
      await provider.scanCleanup();
      await worker.reload(helper.db);
      return worker;
    };

    test('for a still-requested worker', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({state: 'requested'});
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker = await runCheckWorker(worker);

      // RUNNING is set by register which does not happen here
      assert.equal(worker.state, Worker.states.REQUESTED);
    });

    test('for a running worker', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({state: 'running'});
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.RUNNING);
    });

    test('for a terminated instance', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({state: 'running'});
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'TERMINATED');
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
    });

    test('for a stopped instance', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({state: 'running'});
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'STOPPED');
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
    });

    test('for a nonexistent instance', async function() {
      await makeWorkerPool();
      let worker = await suiteMakeWorker({state: 'requested'});
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
    });

    test('for a nonexistent instance with a running operation', async function() {
      await makeWorkerPool();
      const operation = fake.compute.zoneOperations.fakeOperation({zone: 'us-east1-a'});
      let worker = await suiteMakeWorker({state: 'requested', providerData: {operation}});
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.REQUESTED);
    });

    test('for a nonexistent instance with a failed operation', async function() {
      await makeWorkerPool();
      const operation = fake.compute.zoneOperations.fakeOperation({
        zone: 'us-east1-a',
        status: 'DONE',
        error: {
          errors: [{message: 'uhoh'}],
        },
      });
      let worker = await suiteMakeWorker({state: 'requested', providerData: {operation}});
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, Worker.states.STOPPED);
      const errors = await helper.WorkerPoolError.scan({}, {});
      assert.equal(errors.entries.length, 1);
      assert.equal(errors.entries[0].description, 'uhoh');
      assert.equal(errors.entries[0].title, 'Operation Error');
    });

    test('update expiration for a long-running worker', async function() {
      const expires = taskcluster.fromNow('-1 week');
      let worker = await suiteMakeWorker({expires, state: 'running'});
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker = await runCheckWorker(worker);
      assert(worker.expires > expires);
    });

    test('remove unregistered workers after terminateAfter', async function() {
      const terminateAfter = Date.now() - 1000;
      let worker = await suiteMakeWorker({providerData: {terminateAfter}});
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker = await runCheckWorker(worker);
      assert(fake.compute.instances.delete_called);

      // the worker isn't marked as stopped until we see it disappear
      assert.equal(worker.state, 'running');
      worker = await runCheckWorker(worker);
      assert.equal(worker.state, 'stopped');
    });

    test('don\'t remove unregistered before terminateAfter', async function() {
      const terminateAfter = Date.now() + 1000;
      let worker = await suiteMakeWorker({providerData: {terminateAfter}});
      fake.compute.instances.setFakeInstanceStatus(
        project, 'us-east1-a', workerId,
        'RUNNING');
      worker = await runCheckWorker(worker);
      assert(!fake.compute.instances.delete_called);
      assert.equal(worker.state, 'running');
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
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = {};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('invalid token', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'invalid'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong project', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongProject'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong sub', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongSub'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong instance ID', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
        ...defaultWorker,
      });
      const workerIdentityProof = {token: 'wrongId'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /Token validation error/);
    });

    test('wrong worker state (duplicate call to registerWorker)', async function() {
      const workerPool = await makeWorkerPool();
      const worker = await makeWorker({
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
      const worker = await makeWorker({
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
      const worker = await makeWorker({
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
