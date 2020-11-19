const { fromNow } = require('taskcluster-client');
const { range } = require('lodash');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'object' });

  setup('truncate tables', async function() {
    await helper.withDbClient(async client => {
      await client.query('truncate objects');
    });
  });

  helper.dbTest('create_object same object twice should not raise exception', async function(db, isFake) {
    const expires = fromNow('1 year');
    await db.fns.create_object('foo', 'projectId', 'backendId', {}, expires);
    await db.fns.create_object('foo', 'projectId', 'backendId', {}, expires);

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select name, data, project_id, backend_id, expires from objects');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'foo');
      assert.equal(rows[0].project_id, 'projectId');
      assert.equal(rows[0].backend_id, 'backendId');
      assert.deepEqual(rows[0].data, {});
      assert.equal(JSON.stringify(rows[0].expires), JSON.stringify(expires));
    });
  });

  helper.dbTest('create_object with conflict should P0004', async function(db, isFake) {
    const expires = fromNow('1 year');
    await db.fns.create_object('foo', 'projectId', 'backendId', {}, expires);
    await assert.rejects(
        () => db.fns.create_object('foo', 'projectId2', 'backendId', {}, expires),
        err => err.code === 'P0004');

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select name, data, project_id, backend_id, expires from objects');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'foo');
      assert.equal(rows[0].project_id, 'projectId');
      assert.equal(rows[0].backend_id, 'backendId');
      assert.deepEqual(rows[0].data, {});
      assert.equal(JSON.stringify(rows[0].expires), JSON.stringify(expires));
    });
  });

  helper.dbTest('create_object', async function(db, isFake) {
    const expires = fromNow('1 year');
    await db.fns.create_object('foo', 'projectId', 'backendId', {}, expires);

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select name, data, project_id, backend_id, expires from objects');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'foo');
      assert.equal(rows[0].project_id, 'projectId');
      assert.equal(rows[0].backend_id, 'backendId');
      assert.deepEqual(rows[0].data, {});
      assert.equal(JSON.stringify(rows[0].expires), JSON.stringify(expires));
    });
  });

  const insertData = async samples => {
    await helper.withDbClient(async client => {
      for (let s of samples) {
        await client.query(`
            insert into objects (name, data, backend_id, project_id, expires)
            values ($1, $2, $3, $4, $5)`, [s.name, s.data, s.backend_id, s.project_id, s.expires]);
      }
    });
  };

  helper.dbTest('get_expired_objects returns only expired rows', async function(db) {
    const expires = fromNow('-1 day');
    await insertData([
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        expires: fromNow('1 day'), // future
      },
      {
        name: 'object-2',
        backend_id: 'be',
        project_id: 'prj',
        data: { bar: 'baz' },
        expires,
      },
    ]);

    const res = await db.fns.get_expired_objects(null, null);
    assert.deepEqual(res, [
      {
        name: 'object-2',
        backend_id: 'be',
        project_id: 'prj',
        data: { bar: 'baz' },
        expires,
      },
    ]);
  });

  helper.dbTest('get_expired_objects pagination', async function(db) {
    await insertData(range(100).flatMap(i => ([{
      name: `object-${i}-not-expired`,
      backend_id: 'be-not-expired',
      project_id: 'prj-not-expired',
      data: {},
      expires: fromNow('1 day'),
    }, {
      name: `object-${i.toString().padStart(3, '0')}`,
      backend_id: 'be',
      project_id: 'prj',
      data: {},
      expires: fromNow('-1 day'),
    }])));

    const expectedNames = range(100).map(
      i => `object-${i.toString().padStart(3, '0')}`);

    const gotNames = [];
    let startAt = null;
    let iterations = 0;
    while (true) {
      iterations++;
      const res = await db.fns.get_expired_objects({ limit_in: 10, start_at_in: startAt });
      if (res.length === 0) {
        break;
      }
      for (let { name } of res) {
        gotNames.push(name);
        startAt = name;
      }
    }

    assert.deepEqual(gotNames, expectedNames);
    assert.equal(iterations, 11);
  });

  helper.dbTest('get_object', async function(db) {
    const expires = fromNow('1 day');
    await insertData([
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        expires,
      },
    ]);

    const res = await db.fns.get_object('object-1');
    assert.deepEqual(res, [
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        expires,
      },
    ]);
  });

  helper.dbTest('get_object that does not exist', async function(db) {
    const res = await db.fns.get_object('nosuch');
    assert.deepEqual(res, []);
  });

  helper.dbTest('delete_object', async function(db) {
    const expires = fromNow('1 day');
    await insertData([
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        expires,
      },
    ]);

    await db.fns.delete_object('object-1');
    const res = await db.fns.get_object('object-1');
    assert.deepEqual(res, []);
  });

  helper.dbTest('delete_object that does not exist', async function(db) {
    await db.fns.delete_object('nosuch');
    const res = await db.fns.get_object('nosuch');
    assert.deepEqual(res, []);
  });
});
