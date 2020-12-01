const { fromNow } = require('taskcluster-client');
const { range } = require('lodash');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const taskcluster = require('taskcluster-client');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'object' });

  setup('truncate tables', async function() {
    await helper.withDbClient(async client => {
      await client.query('truncate objects');
    });
  });

  helper.dbTest('create_object same object twice should not raise exception', async function(db, isFake) {
    const expires = fromNow('1 year');
    await db.deprecatedFns.create_object('foo', 'projectId', 'backendId', {}, expires);
    await db.deprecatedFns.create_object('foo', 'projectId', 'backendId', {}, expires);

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
    await db.deprecatedFns.create_object('foo', 'projectId', 'backendId', {}, expires);
    await assert.rejects(
      () => db.deprecatedFns.create_object('foo', 'projectId2', 'backendId', {}, expires),
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
    await db.deprecatedFns.create_object('foo', 'projectId', 'backendId', {}, expires);

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

  helper.dbTest('create_object_for_upload', async function(db, isFake) {
    const expires = fromNow('1 year');
    const uploadExpires = fromNow('1 day');
    const uploadId = taskcluster.slugid();
    await db.fns.create_object_for_upload('foo', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires);

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select name, data, project_id, backend_id, upload_id, upload_expires, expires from objects');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'foo');
      assert.equal(rows[0].project_id, 'projectId');
      assert.equal(rows[0].backend_id, 'backendId');
      assert.equal(rows[0].upload_id, uploadId);
      assert.equal(rows[0].upload_expires.toJSON(), uploadExpires.toJSON());
      assert.deepEqual(rows[0].data, {});
      assert.equal(JSON.stringify(rows[0].expires), JSON.stringify(expires));
    });
  });

  helper.dbTest('create_object_for_upload is idempotent', async function(db, isFake) {
    const expires = fromNow('1 year');
    const uploadExpires = fromNow('1 day');
    const uploadId = taskcluster.slugid();
    await db.fns.create_object_for_upload('foo', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires);
    await db.fns.create_object_for_upload('foo', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires);
  });

  helper.dbTest('create_object_for_upload fails if called again with new uploadId', async function(db, isFake) {
    const expires = fromNow('1 year');
    const uploadExpires = fromNow('1 day');
    let uploadId = taskcluster.slugid();

    await db.fns.create_object_for_upload('foo', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires);
    uploadId = taskcluster.slugid();
    await assert.rejects(
      () => db.fns.create_object_for_upload('foo', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires),
      err => err.code === UNIQUE_VIOLATION);
  });

  helper.dbTest('create_object_for_upload fails if two objects use the same uploadId', async function(db, isFake) {
    const expires = fromNow('1 year');
    const uploadExpires = fromNow('1 day');
    let uploadId = taskcluster.slugid();

    await db.fns.create_object_for_upload('foo', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires);
    await assert.rejects(
      () => db.fns.create_object_for_upload('bar', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires),
      err => err.code === UNIQUE_VIOLATION);
  });

  helper.dbTest('object_upload_complete', async function(db, isFake) {
    const expires = fromNow('1 year');
    const uploadExpires = fromNow('1 day');
    let uploadId = taskcluster.slugid();

    await db.fns.create_object_for_upload('foo', 'projectId', 'backendId', uploadId, uploadExpires, {}, expires);
    await db.fns.object_upload_complete('foo', uploadId);

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select name, upload_id, upload_expires from objects');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].upload_id, null);
      assert.equal(rows[0].upload_expires, null);
    });
  });

  const insertData = async samples => {
    await helper.withDbClient(async client => {
      for (let s of samples) {
        await client.query(`
            insert into objects (name, data, backend_id, project_id, upload_id, upload_expires, expires)
            values ($1, $2, $3, $4, $5, $6, $7)`,
        [s.name, s.data, s.backend_id, s.project_id, s.upload_id, s.upload_expires, s.expires]);
      }
    });
  };

  helper.dbTest('get_expired_objects returns only expired rows (including upload_expires)', async function(db) {
    const expires = fromNow('-1 day');
    const uploadExpires = fromNow('-2 day');
    const future = fromNow('1 day');
    await insertData([
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        expires: future,
        upload_expires: future,
      },
      {
        name: 'failed-upload',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        expires: future,
        upload_expires: uploadExpires,
      },
      {
        name: 'object-2',
        backend_id: 'be',
        project_id: 'prj',
        data: { bar: 'baz' },
        expires,
        upload_expires: future,
      },
    ]);

    const res = await db.fns.get_expired_objects(null, null);
    assert.deepEqual(res, [
      {
        name: 'failed-upload',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        expires: future,
      },
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

    const res = await db.deprecatedFns.get_object('object-1');
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

  helper.dbTest('get_object_with_upload', async function(db) {
    const expires = fromNow('1 day');
    await insertData([
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        upload_id: null,
        upload_expires: null,
        expires,
      },
    ]);

    const res = await db.fns.get_object_with_upload('object-1');
    assert.deepEqual(res, [
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        upload_id: null,
        upload_expires: null,
        expires,
      },
    ]);
  });

  helper.dbTest('get_object_with_upload that is still uploading', async function(db) {
    const expires = fromNow('1 day');
    const uploadId = taskcluster.slugid();
    const uploadExpires = fromNow('1 hour');
    await insertData([
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        upload_id: uploadId,
        upload_expires: uploadExpires,
        expires,
      },
    ]);

    const res = await db.fns.get_object_with_upload('object-1');
    assert.deepEqual(res, [
      {
        name: 'object-1',
        backend_id: 'be',
        project_id: 'prj',
        data: { foo: 'bar' },
        upload_id: uploadId,
        upload_expires: uploadExpires,
        expires,
      },
    ]);
  });

  helper.dbTest('get_object_with_upload that does not exist', async function(db) {
    const res = await db.fns.get_object_with_upload('nosuch');
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
    const res = await db.fns.get_object_with_upload('object-1');
    assert.deepEqual(res, []);
  });

  helper.dbTest('delete_object that does not exist', async function(db) {
    await db.fns.delete_object('nosuch');
    const res = await db.fns.get_object_with_upload('nosuch');
    assert.deepEqual(res, []);
  });
});
