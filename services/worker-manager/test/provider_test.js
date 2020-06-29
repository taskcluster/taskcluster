const assert = require('assert');
const helper = require('./helper');
const {Provider} = require('../src/providers/provider');
const testing = require('taskcluster-lib-testing');
const {WorkerPool} = require('../src/data');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
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

  test('no lifecycle', async function() {
    assert.equal(345600100, Provider.interpretLifecycle({}).terminateAfter);
  });

  test('empty lifecycle', async function() {
    assert.equal(345600100, Provider.interpretLifecycle({lifecycle: {}}).terminateAfter);
  });

  test('only registrationTimeout', async function() {
    assert.deepEqual({
      terminateAfter: 10100,
      reregistrationTimeout: 345600000,
    }, Provider.interpretLifecycle({lifecycle: {registrationTimeout: 10}}));
  });

  test('only reregistrationTimeout', async function() {
    assert.deepEqual({
      terminateAfter: 10100,
      reregistrationTimeout: 10000,
    }, Provider.interpretLifecycle({lifecycle: {reregistrationTimeout: 10}}));
  });

  test('greater registrationTimeout', async function() {
    assert.deepEqual({
      terminateAfter: 10100,
      reregistrationTimeout: 10000,
    }, Provider.interpretLifecycle({lifecycle: {
      registrationTimeout: 100,
      reregistrationTimeout: 10,
    }}));
  });

  test('greater reregistrationTimeout', async function() {
    assert.deepEqual({
      terminateAfter: 10100,
      reregistrationTimeout: 100000,
    }, Provider.interpretLifecycle({lifecycle: {
      registrationTimeout: 10,
      reregistrationTimeout: 100,
    }}));
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
        WorkerPoolError: helper.WorkerPoolError,
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
        WorkerPoolError: helper.WorkerPoolError,
      });

      const errors = await helper.WorkerPoolError.scan({}, {});
      assert.equal(errors.entries.length, 1);
      assert.equal(errors.entries[0].workerPoolId, 'ww/tt');

      assert.equal(helper.notify.emails.length, 0);
    });

    test('report errors (w/ email)', async function() {
      const workerPool = await createWP({emailOnError: true});

      await provider.reportError({
        workerPool,
        kind: 'something-error',
        title: 'And Error about Something',
        description: 'WHO KNOWS',
        notify: helper.notify,
        WorkerPoolError: helper.WorkerPoolError,
      });

      const errors = await helper.WorkerPoolError.scan({}, {});
      assert.equal(errors.entries.length, 1);
      assert.equal(errors.entries[0].workerPoolId, 'ww/tt');

      assert.equal(helper.notify.emails.length, 1);
      assert.equal(helper.notify.emails[0].address, 'whatever@example.com');
    });

    test('report errors (w/ email and extraInfo)', async function() {
      const workerPool = await createWP({emailOnError: true});

      await provider.reportError({
        workerPool,
        kind: 'something-error',
        title: 'And Error about Something',
        description: 'WHO KNOWS',
        notify: helper.notify,
        WorkerPoolError: helper.WorkerPoolError,
        extra: {
          foo: 'bar-123-456',
        },
      });

      const errors = await helper.WorkerPoolError.scan({}, {});
      assert.equal(errors.entries.length, 1);
      assert.equal(errors.entries[0].workerPoolId, 'ww/tt');

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
  });
});
