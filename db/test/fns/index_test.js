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
      await client.query('delete from index_namespaces');
    });
    helper.fakeDb.fakeindex.reset();
  });

  const create_index_namespace = async (db, wp = {}) => {
    await db.fns.create_index_namespace(
      wp.parent || 'par/ent',
      wp.name || 'name',
      wp.expires || fromNow('1 day'),
    );
  };
  const update_index_namespace = async (db, t = {}, etag) => {
    return await db.fns.update_index_namespace(
      t.parent || 'par/ent',
      t.name || 'name',
      t.expires || new Date(),
      etag,
    );
  };
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

  suite(`${testing.suiteName()} - index_namespaces`, function() {
    helper.dbTest('create_index_namespace/get_index_namespace', async function(db, isFake) {
      const now = new Date();
      const taskId = slug.nice();
      await create_index_namespace(db, { taskId });

      const rows = await db.fns.get_index_namespace('par/ent', 'name');
      assert.equal(rows[0].parent, 'par/ent');
      assert.equal(rows[0].name, 'name');
      assert(rows[0].expires > now);
    });

    helper.dbTest('get_index_namespace does not omit expired indexed tasks', async function(db, isFake) {
      const now = new Date();
      const taskId = slug.nice();
      await create_index_namespace(db, { expires: now, taskId });

      const rows = await db.fns.get_index_namespace('par/ent', 'name');
      assert.equal(rows.length, 1);
    });

    helper.dbTest('get_index_namespace throws when not found', async function(db, isFake) {
      await assert.rejects(
        async () => {
          await db.fns.get_index_namespace('par/ent', 'name');
        },
        /no such row/,
      );
    });

    helper.dbTest('get_index_namespaces empty', async function(db, isFake) {
      const rows = await db.fns.get_index_namespaces(null, null, null, null);
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_index_namespaces full, pagination', async function(db, isFake) {
      const oneDay = fromNow('1 day');
      for (let i = 0; i < 10; i++) {
        await create_index_namespace(db, {
          parent: `parent/${i}`,
          name: `name/${i}`,
          expires: oneDay,
        });
      }

      let rows = await db.fns.get_index_namespaces(null, null, null, null);
      assert.deepEqual(
        rows.map(r => ({ parent: r.parent, name: r.name })),
        _.range(10).map(i => ({ parent: `parent/${i}`, name: `name/${i}` })));
      assert.deepEqual(rows[0].expires, oneDay);

      rows = await db.fns.get_index_namespaces(null, null, 2, 4);
      assert.deepEqual(
        rows.map(r => ({ parent: r.parent, name: r.name })),
        [4, 5].map(i => ({ parent: `parent/${i}`, name: `name/${i}` })));
    });

    helper.dbTest('get_index_namespaces only returns non expired tasks', async function(db, isFake) {
      const oneDay = fromNow('1 day');
      await create_index_namespace(db, {
        parent: `parent/1`,
        name: `name/1`,
        expires: fromNow('-1 day'),
      });
      await create_index_namespace(db, {
        parent: `parent/2`,
        name: `name/2`,
        expires: oneDay,
      });

      let rows = await db.fns.get_index_namespaces(null, null, null, null);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].parent, 'parent/2');
      assert.equal(rows[0].name, 'name/2');
      assert.deepEqual(rows[0].expires, oneDay);
    });

    helper.dbTest('expire_index_namespaces', async function(db, isFake) {
      await create_index_namespace(db, { parent: 'parent/1', expires: fromNow('- 1 day') });
      await create_index_namespace(db, { parent: 'parent/2', expires: fromNow('- 2 days') });
      await create_index_namespace(db, { parent: 'parent/3', expires: fromNow('1 day') });

      const count = (await db.fns.expire_index_namespaces())[0].expire_index_namespaces;
      assert.equal(count, 2);
      const rows = await db.fns.get_index_namespaces(null, null, null, null);
      assert.equal(rows.length, 1);
    });

    helper.dbTest('update_index_namespace, change to a single field', async function(db, isFake) {
      await create_index_namespace(db);
      await db.fns.update_index_namespace(
        'par/ent',
        'name',
        null,
      );

      const rows = await db.fns.get_index_namespace('par/ent', 'name');
      assert.equal(rows[0].parent, 'par/ent');
      assert.equal(rows[0].name, 'name');
      assert(rows[0].expires instanceof Date);
    });

    helper.dbTest('update_index_namespace, change to multiple fields', async function(db, isFake) {
      await create_index_namespace(db);
      const updated = await db.fns.update_index_namespace(
        'par/ent',
        'name',
        null,
      );

      const rows = await db.fns.get_index_namespace('par/ent', 'name');

      assert.equal(rows[0].parent, 'par/ent');
      assert.equal(rows[0].name, 'name');
      assert(rows[0].expires instanceof Date);
      assert.deepEqual(updated, rows);
    });

    helper.dbTest('update_index_namespace, no changes', async function(db, isFake) {
      await create_index_namespace(db);
      const updated = await db.fns.update_index_namespace(
        'par/ent',
        'name',
        null,
      );
      // this is not 0 because there was a row that matched even though there was no change
      assert.equal(updated.length, 1);

      const rows = await db.fns.get_index_namespace('par/ent', 'name');

      assert.equal(rows[0].parent, 'par/ent');
      assert.equal(rows[0].name, 'name');
      assert(rows[0].expires instanceof Date);
    });

    helper.dbTest('update_index_namespace, throws when row does not exist', async function(db, isFake) {
      await create_index_namespace(db);
      await assert.rejects(
        async () => {
          await db.fns.update_index_namespace(
            'does-not-exist',
            'name',
            null,
          );
        },
        /no such row/,
      );
    });
  });

  suite(`${testing.suiteName()} - indexed_tasks`, function() {
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

      await assert.rejects(
        async () => {
          await db.fns.get_indexed_task('name/space', 'name');
        },
        /no such row/,
      );
    });

    helper.dbTest('get_indexed_task throws when not found', async function(db, isFake) {
      await assert.rejects(
        async () => {
          await db.fns.get_indexed_task('name/space', 'name');
        },
        /no such row/,
      );
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

    helper.dbTest('update_indexed_task, override when etag not specified', async function(db, isFake) {
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

    helper.dbTest('update_indexed_task, throws when etag is wrong', async function(db, isFake) {
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

    helper.dbTest('update_indexed, throws when row does not exist', async function(db, isFake) {
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
