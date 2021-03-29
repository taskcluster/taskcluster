const assert = require('assert').strict;
const taskcluster = require('taskcluster-client');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);
  helper.withBackends(mock, skipping);

  setup(async function() {
    helper.load.save();
  });

  teardown(async function() {
    helper.load.restore();
  });

  test('expiration deletes row when backend returns true', async function() {
    await helper.db.fns.create_object_for_upload({
      name_in: 'test-obj',
      project_id_in: 'proj',
      backend_id_in: 'testBackend',
      upload_id_in: taskcluster.slugid(),
      upload_expires_in: taskcluster.fromNow('1 hour'),
      data_in: { expirationReturns: true },
      expires_in: taskcluster.fromNow('-1 day'),
    });

    await helper.load('expire');

    const res = await helper.db.fns.get_object_with_upload({ name_in: 'test-obj' });
    assert.deepEqual(res, []);
  });

  test('expiration does not delete row when backend returns false', async function() {
    await helper.db.fns.create_object_for_upload({
      name_in: 'test-obj',
      project_id_in: 'proj',
      backend_id_in: 'testBackend',
      upload_id_in: taskcluster.slugid(),
      upload_expires_in: taskcluster.fromNow('1 hour'),
      data_in: { expirationReturns: false },
      expires_in: taskcluster.fromNow('-1 day'),
    });

    await helper.load('expire');

    const res = await helper.db.fns.get_object_with_upload({ name_in: 'test-obj' });
    assert.deepEqual(res.map(obj => obj.name), ['test-obj']);
  });

  test('expiration does not fail row when backend fails', async function() {
    await helper.db.fns.create_object_for_upload({
      name_in: 'test-obj',
      project_id_in: 'proj',
      backend_id_in: 'testBackend',
      upload_id_in: taskcluster.slugid(),
      upload_expires_in: taskcluster.fromNow('1 hour'),
      data_in: { expirationReturns: 'fail' },
      expires_in: taskcluster.fromNow('-1 day'),
    });

    await helper.load('expire');

    const res = await helper.db.fns.get_object_with_upload({ name_in: 'test-obj' });
    assert.deepEqual(res.map(obj => obj.name), ['test-obj']);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({ Type, Fields }) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
  });

  test('expiration does not fail row when backend does not exist', async function() {
    await helper.db.fns.create_object_for_upload({
      name_in: 'test-obj',
      project_id_in: 'proj',
      backend_id_in: 'nosuch',
      upload_id_in: taskcluster.slugid(),
      upload_expires_in: taskcluster.fromNow('1 hour'),
      data_in: { expirationReturns: 'fail' },
      expires_in: taskcluster.fromNow('-1 day'),
    });

    await helper.load('expire');

    const res = await helper.db.fns.get_object_with_upload({ name_in: 'test-obj' });
    assert.deepEqual(res.map(obj => obj.name), ['test-obj']);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({ Type, Fields }) => Type === 'monitor.error' && Fields.message === 'object has unknown backend_id nosuch',
      ).length,
      1);
    monitor.manager.reset();
  });
});
