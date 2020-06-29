const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const slug = require('slugid');
const _ = require('lodash');
const helper = require('../helper');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'queue' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from queue_artifacts');
    });
    helper.fakeDb['queue'].reset();
  });

  helper.dbTest('create_queue_artifact returns the artifact', async function(db, isFake) {
    const now = new Date();
    const taskId = slug.nice();
    const [artifact] = await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    );
    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.name, 'name');
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, {});
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), now.toJSON());
    assert(artifact.etag);
  });

  helper.dbTest('create_queue_artifact throws when row exists', async function(db, isFake) {
    const taskId = slug.nice();
    await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      new Date(),
    );
    await assert.rejects(
      async () => {
        await db.fns.create_queue_artifact(
          taskId,
          0,
          'name',
          'storage-type',
          'content-type',
          {},
          false,
          new Date(),
        );
      },
      err => err.code === UNIQUE_VIOLATION
    );
  });

  helper.dbTest('update_queue_artifacts can update expires and details', async function(db, isFake) {
    if (!isFake) {
      return;
    }
    const taskId = slug.nice();
    const atf = await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      new Date(),
    );
    const [artifact] = await db.fns.update_queue_artifact(taskId, 0, 'name', { details: 'updated' }, new Date(2), atf.etag);

    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, { details: 'updated' });
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), new Date(2).toJSON());
    assert(artifact.etag);
  });

  helper.dbTest('update_queue_artifact no changes to expires and details', async function(db, isFake) {
    const taskId = slug.nice();
    const now = new Date();
    const atf = await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    );
    const [artifact] = await db.fns.update_queue_artifact(taskId, 0, 'name', {}, now, atf.etag);

    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.name, 'name');
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, {});
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), now.toJSON());
    assert(artifact.etag);
  });

  helper.dbTest('get_queue_artifact gets an artifact', async function(db, isFake) {
    const taskId = slug.nice();
    const now = new Date();
    await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    );
    const [artifact] = await db.fns.get_queue_artifact(taskId, 0, 'name');
    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.name, 'name');
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, {});
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), now.toJSON());
    assert(artifact.etag);
  });

  helper.dbTest('get_queue_artifact throws when no such row', async function(db, isFake) {
    const taskId = slug.nice();
    await assert.rejects(
      async () => {
        await db.fns.get_queue_artifact(taskId, 0, 'name');
      },
      /no such row/,
    );
  });

  helper.dbTest('expire_queue_artifacts', async function(db, isFake) {
    await Promise.all([fromNow('- 1 day'), fromNow('1 day')].map((expires, i) => {
      return db.fns.create_queue_artifact(
        slug.nice(),
        0,
        `name-${i}`,
        'storage-type',
        'content-type',
        {},
        false,
        expires,
      )
    }));
    const count = (await db.fns.expire_queue_artifacts())[0].expire_queue_artifacts;

    assert.equal(count, 1);

    await helper.withDbClient(async client => {
      const artifactsCount = (await client.query('select task_id, run_id, name from queue_artifacts')).rowCount;
      assert.equal(artifactsCount, 1);
    });
  });

  helper.dbTest('get_queue_artifacts empty', async function(db, isFake) {
    const rows = await db.fns.get_queue_artifacts(null, null, null, null);
    assert.deepEqual(rows, []);
  });

  helper.dbTest('get_queue_artifacts full, pagination', async function(db, isFake) {
    const now = new Date();
    const taskId = slug.nice();
    for (let i = 0; i < 10; i++) {
      await db.fns.create_queue_artifact(
        taskId,
        i,
        `name-${i}`,
        'storage-type',
        'content-type',
        {},
        false,
        now,
      )
    }

    let rows = await db.fns.get_queue_artifacts(null, null, null, null);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      _.range(10).map(i => ({ task_id: taskId, run_id: i, name: `name-${i}` })));
    assert.equal(rows[0].storage_type, 'storage-type');
    assert.equal(rows[0].content_type, 'content-type');
    assert.deepEqual(rows[0].details, {});
    assert.equal(rows[0].present, false);
    assert.deepEqual(rows[0].expires, now);

    rows = await db.fns.get_queue_artifacts(null, null, null, 2, 4);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      [4, 5].map(i => ({ task_id: taskId, run_id: i, name: `name-${i}` })));
  });

  helper.dbTest('get_queue_artifacts full, pagination filtered by task_id and run_id', async function(db, isFake) {
    const now = new Date();
    const taskId = slug.nice();
    for (let i = 0; i < 10; i++) {
      await db.fns.create_queue_artifact(
        taskId,
        0,
        `name-${i}`,
        'storage-type',
        'content-type',
        {},
        false,
        now,
      )
    }

    let rows = await db.fns.get_queue_artifacts(taskId, 0, null, null);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      _.range(10).map(i => ({ task_id: taskId, run_id: 0, name: `name-${i}` })));
    assert.equal(rows[0].storage_type, 'storage-type');
    assert.equal(rows[0].content_type, 'content-type');
    assert.deepEqual(rows[0].details, {});
    assert.equal(rows[0].present, false);
    assert.deepEqual(rows[0].expires, now);

    rows = await db.fns.get_queue_artifacts(taskId, 0, 2, 4);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      [4, 5].map(i => ({ task_id: taskId, run_id: 0, name: `name-${i}` })));
  });
});
