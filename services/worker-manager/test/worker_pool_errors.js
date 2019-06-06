const slugid = require('slugid');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);

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
});
