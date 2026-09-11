import taskcluster from '@taskcluster/client';
import assert from 'node:assert';
import helper from './helper.js';
import { StaticProvider } from '../src/providers/static.js';
import testing from '@taskcluster/lib-testing';
import { WorkerPool, Worker } from '../src/data.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withPulse(skipping);
  helper.withFakeQueue(skipping);
  helper.withFakeNotify(skipping);
  helper.resetTables();

  let provider;
  let workerPool;
  const providerId = 'stat';
  const workerPoolId = 'foo/bar';
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
  const defaultWorkerPool = {
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
  };

  setup(async () => {
    provider = new StaticProvider({
      providerId,
      db: helper.db,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('google'),
      estimator: await helper.load('estimator'),
      validator: await helper.load('validator'),
      publisher: await helper.load('publisher'),
      launchConfigSelector: await helper.load('launchConfigSelector'),
      fakeCloudApis: {},
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {},
    });
    workerPool = WorkerPool.fromApi(defaultWorkerPool);
    await workerPool.create(helper.db);
    await provider.setup();
  });

  test('updateWorker updates expires, capacity, secret', async () => {
    let worker = Worker.fromApi(defaultWorker);
    await worker.create(helper.db);

    const expires = taskcluster.fromNow('1 day');
    worker = await provider.updateWorker({
      workerPool,
      worker,
      input: {
        expires,
        capacity: 7,
        providerInfo: { staticSecret: 'new-secret' },
      },
    });

    assert.equal(worker.expires.getTime(), expires.getTime());
    assert.equal(worker.capacity, 7);

    const rows = await helper.db.fns.get_worker_3(workerPoolId, workerGroup, workerId);
    assert.deepEqual(
      rows.map(r => [r.worker_id, r.provider_data]),
      [['abc123', { staticSecret: 'new-secret' }]]
    );
  });

  test('removeWorker marks the worker as stopped', async () => {
    const worker = Worker.fromApi(defaultWorker);
    await worker.create(helper.db);

    await provider.removeWorker({ worker, reason: 'uhoh' });

    const rows = await helper.db.fns.get_worker_3(workerPoolId, workerGroup, workerId);
    assert.deepEqual(
      rows.map(({ worker_id, state }) => [worker_id, state]),
      [['abc123', 'stopped']]
    );
  });

  test('removeWorker reports runningDuration and omits deprovisionDuration (INV-4)', async () => {
    // StaticProvider short-circuits straight to STOPPED (no separate stop
    // event), so workerRemoved must carry runningDuration (anchored at
    // removedAt) and must NOT carry deprovisionDuration (there is no
    // remove->stop gap for the static provider).
    const oldnow = Date.now;
    Date.now = () => 50000;
    try {
      const worker = Worker.fromApi({
        ...defaultWorker,
        state: 'running',
        providerData: {
          staticSecret: 'good',
          workerManager: {
            registeredAt: new Date(10000).toJSON(),
          },
        },
      });
      await worker.create(helper.db);

      provider.monitor.manager.reset();
      await provider.removeWorker({ worker, reason: 'inv-4' });

      const msg = provider.monitor.manager.messages.find(m => m.Type === 'worker-removed');
      assert.ok(msg, 'worker-removed log event should be emitted');
      // removedAt is captured at Date.now()=50000; runningDuration = (50000-10000)/1000 = 40.
      assert.equal(
        msg.Fields.runningDuration,
        40,
        'static workerRemoved should report runningDuration anchored at removedAt'
      );
      assert.equal(
        msg.Fields.deprovisionDuration,
        undefined,
        'static workerRemoved must NOT report deprovisionDuration (no remove->stop gap)'
      );
    } finally {
      Date.now = oldnow;
    }
  });

  suite('registerWorker', () => {
    // create a test worker pool directly in the DB
    const createWorker = overrides => {
      const worker = Worker.fromApi({ ...defaultWorker, ...overrides });
      return worker.create(helper.db);
    };

    test('no token', async () => {
      const worker = await createWorker({ state: 'running' });
      const workerIdentityProof = {};
      await assert.rejects(
        () => provider.registerWorker({ workerPool, worker, workerIdentityProof }),
        /missing staticSecret/
      );
    });

    test('not running', async () => {
      const worker = await createWorker({ state: 'stopped' });
      const workerIdentityProof = { staticSecret: 'good' };
      await assert.rejects(
        () => provider.registerWorker({ workerPool, worker, workerIdentityProof }),
        /worker is not running/
      );
    });

    test('invalid token', async () => {
      const worker = await createWorker({ state: 'running' });
      const workerIdentityProof = { staticSecret: 'invalid' };
      await assert.rejects(
        () => provider.registerWorker({ workerPool, worker, workerIdentityProof }),
        /bad staticSecret/
      );
    });

    test('successful registration', async () => {
      const pool = WorkerPool.fromApi({
        ...defaultWorkerPool,
        workerPoolId: 'pool/config',
        config: {
          lifecycle: {
            reregistrationTimeout: 3600,
          },
          workerConfig: {
            someKey: 'someValue',
          },
        },
      });
      await pool.create(helper.db);
      const worker = await createWorker({
        workerPoolId: pool.workerPoolId,
        state: 'running',
        providerData: {
          staticSecret: 'good',
        },
      });
      const workerIdentityProof = { staticSecret: 'good' };
      const res = await provider.registerWorker({ workerPool: pool, worker, workerIdentityProof });
      const expectedExpires = new Date(Date.now() + 3600 * 1000);
      // allow +- 10 seconds since time passes while the test executes
      assert(
        Math.abs(res.expires - expectedExpires) < 10000,
        `${res.expires}, ${expectedExpires}, diff = ${res.expires - expectedExpires} ms`
      );
      assert.equal(res.workerConfig.someKey, 'someValue');
    });
  });
});
