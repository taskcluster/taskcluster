const slugid = require('slugid');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withFakeNotify(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);

  test('create worker pool error', async function() {
    await helper.WorkerPoolError.create({
      workerPoolId: 'baz/foo',
      errorId: slugid.v4(),
      reported: new Date(),
      kind: 'abc',
      title: 'ABC',
      description: 'ay bee see',
      extra: {},
    });

    const errors = await helper.WorkerPoolError.scan({}, {});
    assert.equal(errors.entries.length, 1);
  });

  test('report errors (no email)', async function() {
    const wp = await helper.WorkerPool.create({
      workerPoolId: 'ww/tt',
      providerId: 'testing1',
      description: 'none',
      previousProviderIds: [],
      scheduledForDeletion: false,
      created: new Date(),
      lastModified: new Date(),
      config: {
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
    });

    await wp.reportError({
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
    const wp = await helper.WorkerPool.create({
      workerPoolId: 'ww/tt',
      providerId: 'testing1',
      description: 'none',
      previousProviderIds: [],
      scheduledForDeletion: false,
      created: new Date(),
      lastModified: new Date(),
      config: {
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: true,
    });

    await wp.reportError({
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
    const wp = await helper.WorkerPool.create({
      workerPoolId: 'ww/tt',
      providerId: 'testing1',
      description: 'none',
      previousProviderIds: [],
      scheduledForDeletion: false,
      created: new Date(),
      lastModified: new Date(),
      config: {
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: true,
    });

    await wp.reportError({
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

    const msg = monitorManager.messages.find(msg => msg.Type === 'worker-error');
    if (msg) {
      msg.Fields.errorId = 'errorId'; // since it's random otherwise
      msg.Fields.reported = 'now'; // since it's random otherwise
    }
    assert.deepEqual(msg, {
      Logger: 'taskcluster.worker-manager',
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
