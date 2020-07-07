const _ = require('lodash');
const { fromNow } = require('taskcluster-client');
const slug = require('slugid');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'hooks' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from hooks_last_fires');
    });
  });

  const create_last_fire = async (db, wp = {}) => {
    const [{ create_last_fire: etag }] = await db.fns.create_last_fire(
      wp.hook_group_id || 'hook/group/id',
      wp.hook_id || 'hook-id',
      wp.fired_by || 'fired-by',
      wp.task_id || slug.nice(),
      wp.task_create_time || new Date(),
      wp.result || 'result',
      wp.error || 'error',
    );

    return etag;
  };

  suite(`${testing.suiteName()} - hooks_last_fires`, function() {
    helper.dbTest('create_last_fire/get_last_fires', async function(db) {
      const now = new Date();
      const taskId = slug.nice();
      const etag = await create_last_fire(db, {task_id: taskId, task_create_time: now});
      assert(etag);

      const rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.equal(rows[0].fired_by, 'fired-by');
      assert.equal(rows[0].task_id, taskId);
      assert.deepEqual(rows[0].task_create_time, now);
      assert.deepEqual(rows[0].result, 'result');
      assert.equal(rows[0].error, 'error');
    });

    helper.dbTest('create_last_fire throws when row already exists', async function(db) {
      const now = new Date();
      const taskId = slug.nice();
      await create_last_fire(db, {task_id: taskId, task_create_time: now});

      await assert.rejects(
        async () => {
          await create_last_fire(db, {task_id: taskId, task_create_time: now});
        },
        err => err.code === UNIQUE_VIOLATION,
      );
    });

    helper.dbTest('get_last_fires does not throw when no such row', async function(db) {
      const rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 0);
    });

    helper.dbTest('get_last_fires full, pagination', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create_last_fire(db, {task_id: slug.nice()});
      }

      let rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 4, 0);
      assert.equal(rows.length, 4);

      rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 4, 4);
      assert.equal(rows.length, 4);

      rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 4, 8);
      assert.equal(rows.length, 2);
    });

    helper.dbTest('delete_last_fires', async function(db) {
      await Promise.all(_.range(5).map(() => {
        const taskId = slug.nice();
        return create_last_fire(db, {task_id: taskId});
      }));

      let rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 5);
      await db.fns.delete_last_fires('hook/group/id', 'hook-id');
      rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 0);
    });

    helper.dbTest('delete_last_fires does not throw when no such row', async function(db) {
      await db.fns.delete_last_fires('hook/group/id', 'hook-id');
    });

    helper.dbTest('expire_last_fires does not delete when < 1 year', async function(db) {
      await Promise.all(['1 day', '1 month', '1 year'].map(period => {
        return create_last_fire(db, {task_create_time: fromNow(period)});
      }));

      await db.fns.expire_last_fires();

      const rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 3);
    });

    helper.dbTest('expire_last_fires deletes when > 1 year', async function(db) {
      await Promise.all(['-1 day', '-13 months', '-2 years'].map(period => {
        return create_last_fire(db, {task_create_time: fromNow(period)});
      }));

      const count = (await db.fns.expire_last_fires())[0].expire_last_fires;
      assert.equal(count, 2);

      const rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 1);
    });
  });
});
