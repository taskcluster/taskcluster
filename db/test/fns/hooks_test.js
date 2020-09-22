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
      await client.query('delete from hooks_queues');
      await client.query('delete from hooks');
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

  const create_hooks_queue = async (db, queue = {}) => {
    const [{ create_hooks_queue: etag }] = await db.fns.create_hooks_queue(
      queue.hook_group_id || 'hook/group/id',
      queue.hook_id || 'hook-id',
      queue.queue_name || 'queue-name',
      queue.bindings || '[]', // N.B. JSON-encoded
    );

    return etag;
  };

  const create_hook = async (db, hook = {}) => {
    return db.fns.create_hook(
      hook.hook_group_id || 'hook/group/id',
      hook.hook_id || 'hook-id',
      hook.metadata || {},
      hook.task || {},
      hook.bindings || '[]', // N.B. JSON-encoded
      hook.schedule || '[]', // N.B JSON-encoded
      hook.encrypted_trigger_token || { v: 0, kid: 'azure', __bufchunks_val: 0 },
      hook.encrypted_next_task_id || { v: 0, kid: 'azure', __bufchunks_val: 0 },
      hook.next_scheduled_date || new Date(1),
      hook.trigger_schema || {},
    );
  };

  suite(`${testing.suiteName()} - hooks_last_fires`, function() {
    helper.dbTest('create_last_fire/get_last_fires', async function(db) {
      const now = new Date();
      const taskId = slug.nice();
      await create_last_fire(db, { task_id: taskId, task_create_time: now });

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
      await create_last_fire(db, { task_id: taskId, task_create_time: now });

      await assert.rejects(
        async () => {
          await create_last_fire(db, { task_id: taskId, task_create_time: now });
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
        await create_last_fire(db, { task_id: slug.nice() });
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
        return create_last_fire(db, { task_id: taskId });
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
        return create_last_fire(db, { task_create_time: fromNow(period) });
      }));

      await db.fns.expire_last_fires();

      const rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 3);
    });

    helper.dbTest('expire_last_fires deletes when > 1 year', async function(db) {
      await Promise.all(['-1 day', '-13 months', '-2 years'].map(period => {
        return create_last_fire(db, { task_create_time: fromNow(period) });
      }));

      const count = (await db.fns.expire_last_fires())[0].expire_last_fires;
      assert.equal(count, 2);

      const rows = await db.fns.get_last_fires('hook/group/id', 'hook-id', 10, 0);
      assert.equal(rows.length, 1);
    });
  });

  suite(`${testing.suiteName()} - hooks_queues`, function() {
    helper.dbTest('create_queue/get_queues', async function(db) {
      await create_hooks_queue(db, {});

      const rows = await db.fns.get_hooks_queues(10, 0);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.equal(rows[0].queue_name, 'queue-name');
      assert.deepEqual(rows[0].bindings, []);
    });

    helper.dbTest('create_queue with bindings', async function(db) {
      const bindings = [{ exchange: 'exchange', routingKeyPattern: 'routingKeyPattern' }];
      await create_hooks_queue(db, { bindings: JSON.stringify(bindings) });

      const rows = await db.fns.get_hooks_queues(10, 0);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.equal(rows[0].queue_name, 'queue-name');
      assert.deepEqual(rows[0].bindings, bindings);
    });

    helper.dbTest('create_queue throws when row already exists', async function(db) {
      await create_hooks_queue(db, {});

      await assert.rejects(
        async () => {
          await create_hooks_queue(db, {});
        },
        err => err.code === UNIQUE_VIOLATION,
      );
    });

    helper.dbTest('get_hooks_queues does not throw when no such row', async function(db) {
      const rows = await db.fns.get_hooks_queues(10, 0);
      assert.equal(rows.length, 0);
    });

    helper.dbTest('get_hooks_queues full, pagination', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create_hooks_queue(db, { hook_id: `hook-id/${i}` });
      }

      let rows = await db.fns.get_hooks_queues(4, 0);
      assert.equal(rows.length, 4);

      rows = await db.fns.get_hooks_queues(4, 4);
      assert.equal(rows.length, 4);

      rows = await db.fns.get_hooks_queues(4, 8);
      assert.equal(rows.length, 2);
    });

    helper.dbTest('delete_hooks_queue', async function(db) {
      await Promise.all(_.range(5).map(i => {
        return create_hooks_queue(db, { hook_id: `hook-id/${i}` });
      }));

      let rows = await db.fns.get_hooks_queues(10, 0);
      assert.equal(rows.length, 5);
      await db.fns.delete_hooks_queue('hook/group/id', 'hook-id/1');
      rows = await db.fns.get_hooks_queues(10, 0);
      assert.equal(rows.length, 4);
    });

    helper.dbTest('delete_hooks_queue does not throw when no such row', async function(db) {
      await db.fns.delete_last_fires('hook/group/id', 'hook-id');
    });

    helper.dbTest('update_hooks_queue_bindings updates bindings', async function(db) {
      const bindings = [];
      await create_hooks_queue(db, { bindings });

      bindings.push({ exchange: 'exchange', routingKeyPattern: 'routingKeyPattern' });

      const rows = await db.fns.update_hooks_queue_bindings('hook/group/id', 'hook-id', JSON.stringify(bindings));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.equal(rows[0].queue_name, 'queue-name');
      assert.deepEqual(rows[0].bindings, bindings);
    });
  });

  suite(`${testing.suiteName()} - hooks`, function() {
    helper.dbTest('create_hook/get_hook', async function(db) {
      await create_hook(db, {});

      const rows = await db.fns.get_hook('hook/group/id', 'hook-id');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.deepEqual(rows[0].metadata, {});
      assert.deepEqual(rows[0].task, {});
      assert.deepEqual(rows[0].bindings, []);
      assert.deepEqual(rows[0].schedule, []);
      assert.deepEqual(rows[0].encrypted_trigger_token, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].encrypted_next_task_id, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].next_scheduled_date, new Date(1));
      assert.deepEqual(rows[0].trigger_schema, {});
    });

    helper.dbTest('create_hook with bindings', async function(db) {
      const bindings = [{ exchange: 'exchange', routingKeyPattern: 'routingKeyPattern' }];
      await create_hook(db, { bindings: JSON.stringify(bindings) });

      const rows = await db.fns.get_hook('hook/group/id', 'hook-id');
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.deepEqual(rows[0].metadata, {});
      assert.deepEqual(rows[0].task, {});
      assert.deepEqual(rows[0].bindings, bindings);
      assert.deepEqual(rows[0].schedule, []);
      assert.deepEqual(rows[0].encrypted_trigger_token, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].encrypted_next_task_id, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].next_scheduled_date, new Date(1));
      assert.deepEqual(rows[0].trigger_schema, {});
    });

    helper.dbTest('create_hook throws when row already exists', async function(db) {
      await create_hook(db, {});

      await assert.rejects(
        async () => {
          await create_hook(db, {});
        },
        err => err.code === UNIQUE_VIOLATION,
      );
    });

    helper.dbTest('update_hook, change to a single field', async function(db, isFake) {
      await create_hook(db);
      const bindings = [{ exchange: 'exchange', routingKeyPattern: 'routingKeyPattern' }];
      await db.fns.update_hook(
        'hook/group/id',
        'hook-id',
        null,
        null,
        JSON.stringify(bindings),
        null,
        null,
        null,
        null,
        null,
      );

      const rows = await db.fns.get_hook('hook/group/id', 'hook-id');
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.deepEqual(rows[0].metadata, {});
      assert.deepEqual(rows[0].task, {});
      assert.deepEqual(rows[0].bindings, bindings);
      assert.deepEqual(rows[0].schedule, []);
      assert.deepEqual(rows[0].encrypted_trigger_token, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].encrypted_next_task_id, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].next_scheduled_date, new Date(1));
      assert.deepEqual(rows[0].trigger_schema, {});
    });

    helper.dbTest('update_hook, change an encrypted field', async function(db, isFake) {
      await create_hook(db);
      const nextTaskId = slug.v4();
      await db.fns.update_hook(
        'hook/group/id',
        'hook-id',
        null,
        null,
        null,
        null,
        null,
        db.encrypt({ value: Buffer.from(nextTaskId, 'utf8') }),
        null,
        null,
      );

      const rows = await db.fns.get_hook('hook/group/id', 'hook-id');
      assert.equal(db.decrypt({ value: rows[0].encrypted_next_task_id }).toString('utf8'), nextTaskId);
      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.deepEqual(rows[0].metadata, {});
      assert.deepEqual(rows[0].task, {});
      assert.deepEqual(rows[0].bindings, []);
      assert.deepEqual(rows[0].schedule, []);
      assert.deepEqual(rows[0].encrypted_trigger_token, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].next_scheduled_date, new Date(1));
      assert.deepEqual(rows[0].trigger_schema, {});
    });

    helper.dbTest('update_hook, no changes', async function(db, isFake) {
      await create_hook(db);
      const updated = await db.fns.update_hook(
        'hook/group/id',
        'hook-id',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );
      // this is not 0 because there was a row that matched even though there was no change
      assert.equal(updated.length, 1);

      const rows = await db.fns.get_hook('hook/group/id', 'hook-id');

      assert.equal(rows[0].hook_group_id, 'hook/group/id');
      assert.equal(rows[0].hook_id, 'hook-id');
      assert.deepEqual(rows[0].metadata, {});
      assert.deepEqual(rows[0].task, {});
      assert.deepEqual(rows[0].bindings, []);
      assert.deepEqual(rows[0].schedule, []);
      assert.deepEqual(rows[0].encrypted_trigger_token, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].encrypted_next_task_id, { v: 0, kid: 'azure', __bufchunks_val: 0 });
      assert.deepEqual(rows[0].next_scheduled_date, new Date(1));
      assert.deepEqual(rows[0].trigger_schema, {});
    });

    helper.dbTest('update_hook, throws when row does not exist', async function(db, isFake) {
      await assert.rejects(
        async () => {
          await db.fns.update_hook(
            'does-not-exist',
            'does-not-exist',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          );
        },
        /no such row/,
      );
    });

    helper.dbTest('get_hooks does not throw when no such row', async function(db) {
      const rows = await db.fns.get_hooks(null, null, 10, 0);
      assert.equal(rows.length, 0);
    });

    helper.dbTest('get_hooks full, pagination', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create_hook(db, { hook_id: `hook-id/${i}` });
      }

      let rows = await db.fns.get_hooks(null, null, 4, 0);
      assert.equal(rows.length, 4);

      rows = await db.fns.get_hooks(null, null, 4, 4);
      assert.equal(rows.length, 4);

      rows = await db.fns.get_hooks(null, null, 4, 8);
      assert.equal(rows.length, 2);
    });

    helper.dbTest('get_hooks filtered by hook group id', async function(db) {
      for (let i = 0; i < 10; i++) {
        if (i < 5) {
          await create_hook(db, { hook_group_id: 'foo', hook_id: `hook-id/${i}` });
        } else {
          await create_hook(db, { hook_id: `hook-id/${i}` });
        }
      }

      let rows = await db.fns.get_hooks('foo', null, 10, 0);
      assert.equal(rows.length, 5);
      assert.equal(rows.filter(r => r.hook_group_id === 'foo').length, 5);
    });

    helper.dbTest('get_hooks filtered by next_scheduled_date', async function(db) {
      const oneDayAgo = fromNow('-1 day');
      const now = fromNow();
      for (let i = 0; i < 10; i++) {
        if (i < 5) {
          await create_hook(db, { hook_id: `hook-id/${i}`, next_scheduled_date: fromNow('1 day') });
        } else {
          await create_hook(db, { hook_id: `hook-id/${i}`, next_scheduled_date: oneDayAgo });
        }
      }

      let rows = await db.fns.get_hooks(null, now, 10, 0);
      assert.equal(rows.length, 5);
      rows.forEach(r => {
        assert(r.next_scheduled_date < now);
      });
    });

    helper.dbTest('get_hooks filtered by hook_group_id and next_scheduled_date', async function(db) {
      const oneDayAgo = fromNow('-1 day');
      const now = fromNow();
      await create_hook(db, { hook_group_id: 'foo', next_scheduled_date: oneDayAgo });
      for (let i = 0; i < 10; i++) {
        if (i < 5) {
          await create_hook(db, { hook_group_id: 'foo', hook_id: `hook-id/${i}`, next_scheduled_date: fromNow('1 day') });
        } else {
          await create_hook(db, { hook_group_id: 'bar', hook_id: `hook-id/${i}`, next_scheduled_date: oneDayAgo });
        }
      }

      let rows = await db.fns.get_hooks('foo', now, 10, 0);
      assert.equal(rows.length, 1);
      rows.forEach(r => {
        assert(r.next_scheduled_date < now);
        assert.equal(r.hook_group_id, 'foo');
      });
    });

    helper.dbTest('delete_hook', async function(db) {
      await Promise.all(_.range(5).map(i => {
        return create_hook(db, { hook_id: `hook-id/${i}` });
      }));

      let rows = await db.fns.get_hooks(null, null, 10, 0);
      assert.equal(rows.length, 5);
      await db.fns.delete_hook('hook/group/id', 'hook-id/1');
      rows = await db.fns.get_hooks(null, null, 10, 0);
      assert.equal(rows.length, 4);
    });

    helper.dbTest('delete_hook does not throw when no such row', async function(db) {
      await db.fns.delete_hook('hook/group/id', 'hook-id');
    });
  });
});
