const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');
const slug = require('slugid');
const helper = require('../helper');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'queue' });

  const taskIds = [
    slug.nice(),
    slug.nice(),
    slug.nice(),
  ];

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from queue_artifacts');
    });
    helper.fakeDb['queue'].reset();
  });

  helper.dbTest('create_queue_artifact returns an etag string', async function(db, isFake) {
    const taskId = slug.nice();
    const etag = (await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      new Date(),
    ))[0].create_queue_artifact;
    assert(typeof etag === 'string');
  });

  helper.dbTest('update_queue_artifacts can update expires and details', async function(db, isFake) {
    if (!isFake) {
      return;
    }
    const taskId = slug.nice();
    const etag = (await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      new Date(),
    ))[0].create_queue_artifact;
    const [artifact] = await db.fns.update_queue_artifact(taskId, 0, 'name', { details: 'updated' }, new Date(2), etag);

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
    const etag = (await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    ))[0].create_queue_artifact;
    const [artifact] = await db.fns.update_queue_artifact(taskId, 0, 'name', {}, now, etag);

    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
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

  helper.dbTest('delete_queue_artifact deletes an artifact', async function(db, isFake) {
    const taskId = slug.nice();
    const now = new Date();
    const etag = (await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    ))[0].create_queue_artifact;
    await db.fns.delete_queue_artifact(taskId, 0, 'name');
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
});
