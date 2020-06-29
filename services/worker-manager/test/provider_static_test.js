const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const {StaticProvider} = require('../src/providers/static');
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
  let workerPool;
  let providerId = 'stat';
  let workerPoolId = 'foo/bar';

  setup(async function() {
    provider = new StaticProvider({
      providerId,
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

  suite('registerWorker', function() {
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

    // create a test worker pool directly in the DB
    const createWorker = overrides => {
      const worker = Worker.fromApi(
        {...defaultWorker, ...overrides});
      return worker.create(helper.db);
    };

    test('no token', async function() {
      const worker = await createWorker({});
      const workerIdentityProof = {};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /missing staticSecret/);
    });

    test('invalid token', async function() {
      const worker = await createWorker({});
      const workerIdentityProof = {staticSecret: 'invalid'};
      await assert.rejects(() =>
        provider.registerWorker({workerPool, worker, workerIdentityProof}),
      /bad staticSecret/);
    });

    test('successful registration', async function() {
      const worker = await createWorker({
        providerData: {
          staticSecret: 'good',
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const workerIdentityProof = {staticSecret: 'good'};
      const res = await provider.registerWorker({workerPool, worker, workerIdentityProof});
      const expectedExpires = new Date(Date.now() + 3600 * 1000);
      // allow +- 10 seconds since time passes while the test executes
      assert(Math.abs(res.expires - expectedExpires) < 10000,
        `${res.expires}, ${expectedExpires}, diff = ${res.expires - expectedExpires} ms`);
      assert.equal(res.workerConfig.someKey, 'someValue');
    });
  });
});
