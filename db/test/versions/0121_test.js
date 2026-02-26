import assert from 'assert';
import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('column added and functions work', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);
    await helper.assertNoTableColumn('queue_artifacts', 'content_length');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTableColumn('queue_artifacts', 'content_length');

    const db = await helper.setupDb('queue');

    // New create function with content_length
    const [created] = await db.fns.create_queue_artifact_2(
      'task-id', 0, 'public/test.log', 's3', 'text/plain',
      JSON.stringify({ bucket: 'b', prefix: 'p' }), true,
      new Date(Date.now() + 100000), 12345,
    );
    assert.equal(created.content_length, 12345);

    // New get function returns content_length
    const [fetched] = await db.fns.get_queue_artifact_2('task-id', 0, 'public/test.log');
    assert.equal(fetched.content_length, 12345);

    // Old create function still works (no content_length param)
    const [oldCreated] = await db.deprecatedFns.create_queue_artifact(
      'task-id-2', 0, 'public/old.log', 's3', 'text/plain',
      JSON.stringify({ bucket: 'b', prefix: 'p2' }), true,
      new Date(Date.now() + 100000),
    );
    assert.equal(oldCreated.content_length, undefined); // old fn doesn't return it

    // Old get function still works
    const [oldFetched] = await db.deprecatedFns.get_queue_artifact('task-id', 0, 'public/test.log');
    assert.equal(oldFetched.content_length, undefined); // old fn doesn't return it

    // Paginated function returns content_length
    const paginated = await db.fns.get_queue_artifacts_paginated_2(
      'task-id', 0, null, 100, null, null, null,
    );
    assert.equal(paginated.length, 1);
    assert.equal(paginated[0].content_length, 12345);

    // Expired artifacts function returns content_length
    await db.fns.create_queue_artifact_2(
      'task-id-exp', 0, 'public/exp.log', 's3', 'text/plain',
      JSON.stringify({ bucket: 'b', prefix: 'p3' }), true,
      new Date(Date.now() - 100000), 99999,
    );
    const expired = await db.fns.get_expired_artifacts_for_deletion_2(new Date(), 100);
    assert(expired.length >= 1);
    const expArt = expired.find(r => r.task_id === 'task-id-exp');
    assert.equal(expArt.content_length, 99999);
  });

  test('downgrade removes column', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTableColumn('queue_artifacts', 'content_length');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTableColumn('queue_artifacts', 'content_length');
  });
});
