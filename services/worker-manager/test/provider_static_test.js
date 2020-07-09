const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const { StaticProvider } = require('../src/providers/static');
const testing = require('taskcluster-lib-testing');
const { WorkerPool, Worker } = require('../src/data');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.resetTables(mock, skipping);

  let provider;
  let workerPool;
  let providerId = 'stat';
  let workerPoolId = 'foo/bar';
  const workerGroup = providerId;
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
    providerData: {
      staticSecret: 'good',
    },
  };

  setup(async function() {
    provider = new StaticProvider({
      providerId,
      db: helper.db,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('google'),
      estimator: await helper.load('estimator'),
      fakeCloudApis: {},
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {},
    });
    workerPool = WorkerPool.fromApi({
      workerPoolId,
      providerId,
      description: 'none',
      previousProviderIds: [],
      created: new Date(),
      lastModified: new Date(),
      config: {
        lifecycle: {
          reregistrationTimeout: 3600,
        },
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
    });
    await workerPool.create(helper.db);
    await provider.setup();
  });

  test('removeWorker marks the worker as stopped', async function() {
    const worker = Worker.fromApi(defaultWorker);
    await worker.create(helper.db);

    await provider.removeWorker({ worker, reason: 'uhoh' });

    const rows = await helper.db.fns.get_worker_2(workerPoolId, workerGroup, workerId);
    assert.deepEqual(rows.map(({ worker_id, state }) => ([worker_id, state])), [
      ['abc123', 'stopped'],
    ]);
  });

  suite('registerWorker', function() {
    // create a test worker pool directly in the DB
    const createWorker = overrides => {
      const worker = Worker.fromApi(
        { ...defaultWorker, ...overrides });
      return worker.create(helper.db);
    };

    test('no token', async function() {
      const worker = await createWorker({ state: 'running' });
      const workerIdentityProof = {};
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /missing staticSecret/);
    });

    test('not running', async function() {
      const worker = await createWorker({ state: 'stopped' });
      const workerIdentityProof = { staticSecret: 'good' };
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /worker is not running/);
    });

    test('invalid token', async function() {
      const worker = await createWorker({ state: 'running' });
      const workerIdentityProof = { staticSecret: 'invalid' };
      await assert.rejects(() =>
        provider.registerWorker({ workerPool, worker, workerIdentityProof }),
      /bad staticSecret/);
    });

    test('successful registration', async function() {
      const worker = await createWorker({
        state: 'running',
        providerData: {
          staticSecret: 'good',
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const workerIdentityProof = { staticSecret: 'good' };
      const res = await provider.registerWorker({ workerPool, worker, workerIdentityProof });
      const expectedExpires = new Date(Date.now() + 3600 * 1000);
      // allow +- 10 seconds since time passes while the test executes
      assert(Math.abs(res.expires - expectedExpires) < 10000,
        `${res.expires}, ${expectedExpires}, diff = ${res.expires - expectedExpires} ms`);
      assert.equal(res.workerConfig.someKey, 'someValue');
    });
  });
});
