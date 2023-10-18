import assert from 'assert';
import helper from './helper.js';
import { Provider } from '../src/providers/provider.js';
import taskcluster from 'taskcluster-client';
import testing from 'taskcluster-lib-testing';
import { WorkerPool, WorkerPoolError, Worker } from '../src/data.js';
import { LEVELS } from 'taskcluster-lib-monitor';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.resetTables(mock, skipping);

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  let oldnow;
  setup(function() {
    oldnow = Date.now;
    Date.now = () => 100;
  });

  teardown(function() {
    Date.now = oldnow;
  });

  suite('interpretLifecycle', function() {
    test('no lifecycle', async function() {
      assert.equal(345600100, Provider.interpretLifecycle({}).terminateAfter);
    });

    test('empty lifecycle', async function() {
      assert.equal(345600100, Provider.interpretLifecycle({ lifecycle: {} }).terminateAfter);
    });

    test('no queueInactivityTimeout', async function () {
      assert.equal(7200000, Provider.interpretLifecycle({}).queueInactivityTimeout);
    });

    test('only queueInactivityTimeout', async function () {
      assert.equal(4000, Provider.interpretLifecycle({
        lifecycle: { queueInactivityTimeout: 4 } }).queueInactivityTimeout);
    });

    test('only registrationTimeout', async function() {
      assert.deepEqual({
        terminateAfter: 10100,
        reregistrationTimeout: 345600000,
        queueInactivityTimeout: 7200000,
      }, Provider.interpretLifecycle({ lifecycle: { registrationTimeout: 10 } }));
    });

    test('only reregistrationTimeout', async function() {
      assert.deepEqual({
        terminateAfter: 10100,
        reregistrationTimeout: 10000,
        queueInactivityTimeout: 7200000,
      }, Provider.interpretLifecycle({ lifecycle: { reregistrationTimeout: 10 } }));
    });

    test('greater registrationTimeout', async function() {
      assert.deepEqual({
        terminateAfter: 10100,
        reregistrationTimeout: 10000,
        queueInactivityTimeout: 5000,
      }, Provider.interpretLifecycle({ lifecycle: {
        registrationTimeout: 100,
        reregistrationTimeout: 10,
        queueInactivityTimeout: 5,
      } }));
    });

    test('greater reregistrationTimeout', async function() {
      assert.deepEqual({
        terminateAfter: 10100,
        reregistrationTimeout: 100000,
        queueInactivityTimeout: 7200000,
      }, Provider.interpretLifecycle({ lifecycle: {
        registrationTimeout: 10,
        reregistrationTimeout: 100,
      } }));
    });
  });

  suite('isZombie', function() {
    test('default queue inactivity timeout', function() {
      Date.now = oldnow;
      const worker = Worker.fromApi({});
      worker.created = taskcluster.fromNow('-4 hours');
      const res = Provider.isZombie({ worker });
      assert.equal(res.isZombie, true);
      assert.match(res.reason, /queueInactivityTimeout=7200s/);
    });
    test('no firstClaim', function() {
      Date.now = oldnow;
      const worker = Worker.fromApi({});
      worker.created = taskcluster.fromNow('-4 hours');
      const res = Provider.isZombie({ worker });
      assert.equal(res.isZombie, true);
      assert.match(res.reason, /worker never claimed work/);
    });
    test('no lastDateActive', function() {
      Date.now = oldnow;
      const worker = Worker.fromApi({});
      worker.created = taskcluster.fromNow('-4 hours');
      worker.firstClaim = taskcluster.fromNow('-4 hours');
      const res = Provider.isZombie({ worker });
      assert.equal(res.isZombie, true);
      assert.match(res.reason, /worker never reclaimed work/);
    });
    test('not active within queueInactivityTimeout', function() {
      Date.now = oldnow;
      const worker = Worker.fromApi({
        providerData: {
          queueInactivityTimeout: 1,
        },
      });
      worker.created = taskcluster.fromNow('-5 minutes');
      worker.firstClaim = taskcluster.fromNow('-4 minutes');
      worker.lastDateActive = taskcluster.fromNow('-3 minutes');
      const res = Provider.isZombie({ worker });
      assert.equal(res.isZombie, true);
      assert.match(res.reason, /worker inactive/);
    });
    test('not a zombie', function() {
      Date.now = oldnow;
      const worker = Worker.fromApi({
        providerData: {
          queueInactivityTimeout: 60 * 60 * 24 * 1000,
        },
      });
      worker.created = taskcluster.fromNow('-5 minutes');
      worker.firstClaim = taskcluster.fromNow('-4 minutes');
      worker.lastdDateActive = taskcluster.fromNow('-3 minutes');
      const res = Provider.isZombie({ worker });
      assert.equal(res.isZombie, false);
    });
  });

  suite('reportError', function() {
    const createWP = async (overrides = {}) => {
      const workerPool = WorkerPool.fromApi({
        workerPoolId: 'ww/tt',
        providerId: 'testing1',
        description: 'none',
        scheduledForDeletion: false,
        config: {},
        owner: 'whatever@example.com',
        emailOnError: false,
        ...overrides,
      });
      await workerPool.create(helper.db);
      return workerPool;
    };

    let provider;
    suiteSetup(async function() {
      provider = new Provider({
        notify: await helper.load('notify'),
        db: helper.db,
        monitor,
        WorkerPoolError: WorkerPoolError,
        // other stuff omitted..
      });
    });

    test('report errors (no email)', async function() {
      const workerPool = await createWP();

      await provider.reportError({
        workerPool,
        kind: 'something-error',
        title: 'And Error about Something',
        description: 'WHO KNOWS',
        notify: helper.notify,
        WorkerPoolError: WorkerPoolError,
      });

      const errors = await helper.db.fns.get_worker_pool_errors_for_worker_pool(null, 'ww/tt', null, null);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].worker_pool_id, 'ww/tt');

      assert.equal(helper.notify.emails.length, 0);
    });

    test('report errors (w/ email)', async function() {
      const workerPool = await createWP({ emailOnError: true });

      await provider.reportError({
        workerPool,
        kind: 'something-error',
        title: 'And Error about Something',
        description: 'WHO KNOWS',
        notify: helper.notify,
        WorkerPoolError: WorkerPoolError,
      });

      const errors = await helper.db.fns.get_worker_pool_errors_for_worker_pool(null, 'ww/tt', null, null);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].worker_pool_id, 'ww/tt');

      assert.equal(helper.notify.emails.length, 1);
      assert.equal(helper.notify.emails[0].address, 'whatever@example.com');
    });

    test('report errors (w/ email and extraInfo)', async function() {
      const workerPool = await createWP({ emailOnError: true });

      await provider.reportError({
        workerPool,
        kind: 'something-error',
        title: 'And Error about Something',
        description: 'WHO KNOWS',
        notify: helper.notify,
        WorkerPoolError: WorkerPoolError,
        extra: {
          foo: 'bar-123-456',
        },
      });

      const errors = await helper.db.fns.get_worker_pool_errors_for_worker_pool(null, 'ww/tt', null, null);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].worker_pool_id, 'ww/tt');

      assert.equal(helper.notify.emails.length, 1);
      assert.equal(helper.notify.emails[0].address, 'whatever@example.com');
      assert(helper.notify.emails[0].content.includes('bar-123-456'));

      const msg = monitor.manager.messages.find(msg => msg.Type === 'worker-error');
      if (msg) {
        msg.Fields.errorId = 'errorId'; // since it's random otherwise
        msg.Fields.reported = 'now'; // since it's random otherwise
      }
      assert.deepEqual(msg, {
        Logger: 'taskcluster.test',
        Type: 'worker-error',
        Fields: {
          workerPoolId: 'ww/tt',
          errorId: 'errorId',
          reported: 'now',
          kind: 'something-error',
          title: 'And Error about Something',
          description: 'WHO KNOWS',
          v: 1,
        },
        Severity: LEVELS.notice,
      });
    });

    test('calc seen total', () => {
      assert.equal(0, Provider.calcSeenTotal());
      assert.equal(1, Provider.calcSeenTotal({
        'gecko-t/cpu': 1,
      }));
      assert.equal(55, Provider.calcSeenTotal({
        'gecko-t/win95-sp2': 33,
        'gecko-t/win98-x64': 20,
        'gecko-t/win7-gpu': 1,
        'gecko-t/win7-x64': 1,
      }));
    });
  });
});
