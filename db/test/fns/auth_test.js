const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const _ = require('lodash');

suite(`${testing.suiteName()} - clients`, function() {
  helper.withDbForProcs({ serviceName: 'auth' });

  const clients = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset clients table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from clients_entities`);
      await client.query(`insert into clients_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    helper.fakeDb.auth.reset();
    helper.fakeDb.auth.clients_entities_create('foo', 'bar', clients[0], false, 1);
    helper.fakeDb.auth.clients_entities_create('bar', 'foo', clients[1], false, 1);
  });

  helper.dbTest('clients_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.clients_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(clients[0], fooClient.value);
  });

  helper.dbTest('clients_entities_create', async function(db, isFake) {
    const [{ clients_entities_create: etag }] = await db.fns.clients_entities_create('baz', 'gamma', clients[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.clients_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(clients[2], bazClient.value);
  });

  helper.dbTest('clients_entities_create throws when overwrite is false', async function(db, isFake) {
    await db.fns.clients_entities_create('baz', 'gamma', clients[2], false, 1);
    await assert.rejects(
      () => db.fns.clients_entities_create('baz', 'gamma', clients[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('clients_entities_create does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.clients_entities_create('baz', 'gamma', clients[2], true, 1);
    await db.fns.clients_entities_create('baz', 'gamma', { ...clients[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.clients_entities_load('baz', 'gamma');
    assert.deepEqual({ ...clients[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('clients_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.clients_entities_remove('foo', 'bar');
    const c = await db.fns.clients_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('clients_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.clients_entities_load('foo', 'bar');
    const [etag] = await db.fns.clients_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.clients_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('clients_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.clients_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.clients_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('clients_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.clients_entities_load('foo', 'bar');
    await db.fns.clients_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.clients_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });

  // TODO : Add test for clients_entities_scan
});
