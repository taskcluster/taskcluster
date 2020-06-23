const _ = require('lodash');
const slug = require('slugid');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'index' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from indexed_tasks');
    });
    helper.fakeDb.fakeindex.reset();
  });

  const create_indexed_task = async (db, wp = {}) => {
    await db.fns.create_indexed_task(
      wp.namespace || 'name/space',
      wp.name || 'name',
      wp.rank || 1,
      wp.taskId || slug.nice(),
      wp.data || { data: true },
      wp.expires || fromNow('1 day'),
    );
  };
  const update_indexed_task = async (db, t = {}, etag) => {
    return await db.fns.update_indexed_task(
      t.namespace || 'name/space',
      t.name || 'name',
      t.rank || 1,
      t.taskId || slug.nice(),
      t.data || {data: true},
      t.expires || new Date(),
      etag,
    );
  };

  suite(`${testing.suiteName()} - workers`, function() {
    helper.dbTest('create_indexed_task/get_indexed_task', async function(db, isFake) {
      const now = new Date();
      const taskId = slug.nice();
      await create_indexed_task(db, { taskId });

      const rows = await db.fns.get_indexed_task('name/space', 'name');
      assert.equal(rows[0].namespace, 'name/space');
      assert.equal(rows[0].name, 'name');
      assert.equal(rows[0].rank, 1);
      assert.equal(rows[0].task_id, taskId);
      assert.deepEqual(rows[0].data, {data: true});
      assert(rows[0].expires > now);
    });

    helper.dbTest('get_indexed_task omits expired indexed tasks', async function(db, isFake) {
      const now = new Date();
      const taskId = slug.nice();
      await create_indexed_task(db, { expires: now, taskId });

      const rows = await db.fns.get_indexed_task('name/space', 'name');
      assert.equal(rows.length, 0);
    });

    helper.dbTest('get_indexed_task not found', async function(db, isFake) {
      const rows = await db.fns.get_indexed_task('name/space', 'name');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_indexed_tasks empty', async function(db, isFake) {
      const rows = await db.fns.get_indexed_tasks(null, null, null, null);
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_indexed_tasks full, pagination', async function(db, isFake) {
      const oneDay = fromNow('1 day');
      for (let i = 0; i < 10; i++) {
        await create_indexed_task(db, {
          namespace: `namespace/${i}`,
          name: `name/${i}`,
          rank: 1,
          expires: oneDay,
        });
      }

      let rows = await db.fns.get_indexed_tasks(null, null, null, null);
      assert.deepEqual(
        rows.map(r => ({ namespace: r.namespace, name: r.name })),
        _.range(10).map(i => ({ namespace: `namespace/${i}`, name: `name/${i}` })));
      assert.equal(rows[0].rank, 1);
      assert.equal(rows[0].task_id.length, 22);
      assert.deepEqual(rows[0].data, {data: true});
      assert.deepEqual(rows[0].expires, oneDay);

      rows = await db.fns.get_indexed_tasks(null, null, 2, 4);
      assert.deepEqual(
        rows.map(r => ({ namespace: r.namespace, name: r.name })),
        [4, 5].map(i => ({ namespace: `namespace/${i}`, name: `name/${i}` })));
    });

    helper.dbTest('get_indexed_tasks only returns non expired tasks', async function(db, isFake) {
      const oneDay = fromNow('1 day');
      await create_indexed_task(db, {
        namespace: `namespace/1`,
        name: `name/1`,
        rank: 1,
        expires: fromNow('-1 day'),
      });
      await create_indexed_task(db, {
        namespace: `namespace/2`,
        name: `name/2`,
        rank: 1,
        expires: oneDay,
      });

      let rows = await db.fns.get_indexed_tasks(null, null, null, null);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].namespace, 'namespace/2');
      assert.equal(rows[0].name, 'name/2');
      assert.equal(rows[0].task_id.length, 22);
      assert.deepEqual(rows[0].data, {data: true});
      assert.deepEqual(rows[0].expires, oneDay);
    });

    helper.dbTest('expire_indexed_tasks', async function(db, isFake) {
      await create_indexed_task(db, { namespace: 'namespace/1', expires: fromNow('- 1 day') });
      await create_indexed_task(db, { namespace: 'namespace/2', expires: fromNow('- 2 days') });
      await create_indexed_task(db, { namespace: 'namespace/3', expires: fromNow('1 day') });

      const count = (await db.fns.expire_indexed_tasks())[0].expire_indexed_tasks;
      assert.equal(count, 2);
      const rows = await db.fns.get_indexed_tasks(null, null, null, null);
      assert.equal(rows.length, 1);
    });

    helper.dbTest('update_indexed_task, change to a single field', async function(db, isFake) {
      const etag = await create_indexed_task(db);
      await db.fns.update_indexed_task(
        'name/space',
        'name',
        2,
        null,
        null,
        null,
        etag,
      );

      const rows = await db.fns.get_indexed_task('name/space', 'name');
      assert.equal(rows[0].namespace, 'name/space');
      assert.equal(rows[0].name, 'name');
      assert.equal(rows[0].rank, 2);
      assert.equal(rows[0].task_id.length, 22);
      assert.deepEqual(rows[0].data, { data: true });
      assert(rows[0].expires instanceof Date);
    });

    helper.dbTest('update_indexed_task, change to a multiple fields', async function(db, isFake) {
      const etag = await create_indexed_task(db);
      const updated = await db.fns.update_indexed_task(
        'name/space',
        'name',
        2,
        null,
        { data: 'updated' },
        null,
        etag,
      );

      const rows = await db.fns.get_indexed_task('name/space', 'name');

      assert.equal(rows[0].namespace, 'name/space');
      assert.equal(rows[0].name, 'name');
      assert.equal(rows[0].rank, 2);
      assert.equal(rows[0].task_id.length, 22);
      assert(rows[0].expires instanceof Date);
      assert.deepEqual(rows[0].data, { data: 'updated' });
      assert.deepEqual(updated, rows);
    });

    helper.dbTest('update_indexed_task, no changes', async function(db, isFake) {
      const etag = await create_indexed_task(db);
      const updated = await db.fns.update_indexed_task(
        'name/space',
        'name',
        null,
        null,
        null,
        null,
        etag,
      );
      // this is not 0 because there was a row that matched even though there was no change
      assert.equal(updated.length, 1);

      const rows = await db.fns.get_indexed_task('name/space', 'name');

      assert.equal(rows[0].namespace, 'name/space');
      assert.equal(rows[0].name, 'name');
      assert.equal(rows[0].rank, 1);
      assert.equal(rows[0].task_id.length, 22);
      assert(rows[0].expires instanceof Date);
    });

    helper.dbTest('update_indexed_task, indexed task doesn\'t exist', async function(db, isFake) {
      const etag = await create_indexed_task(db);

      await assert.rejects(
        async () => {
          await update_indexed_task(db, { namespace: 'does-not-exist' }, etag);
        },
        /no such row/,
      );
    });

    helper.dbTest('update_worker, override when etag not specified', async function(db, isFake) {
      await create_indexed_task(db);
      await db.fns.update_indexed_task(
        'name/space',
        'name',
        2,
        null,
        null,
        null,
        null, /* etag */
      );

      const rows = await db.fns.get_indexed_task('name/space', 'name');
      assert.equal(rows[0].rank, 2);
    });

    helper.dbTest('update_worker, throws when etag is wrong', async function(db, isFake) {
      await create_indexed_task(db);
      await assert.rejects(
        async () => {
          await db.fns.update_indexed_task(
            'name/space',
            'name',
            2,
            null,
            null,
            null,
            '915a609a-f3bb-42fa-b584-a1209e7d9a02', /* etag */
          );
        },
        /unsuccessful update/,
      );
    });

    helper.dbTest('update_worker, throws when row does not exist', async function(db, isFake) {
      const etag = await create_indexed_task(db);

      await assert.rejects(
        async () => {
          await db.fns.update_indexed_task(
            'does-not-exist',
            'name',
            2, /* rank */
            null,
            null,
            null,
            etag,
          );
        },
        /no such row/,
      );
    });
  });
});
