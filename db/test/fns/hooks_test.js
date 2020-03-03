const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const _ = require('lodash');

suite(`${testing.suiteName()} - hooks`, function() {
  helper.withDbForProcs({ serviceName: 'hooks' });

  const hooks = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset hooks table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from hooks_entities`);
      await client.query(`insert into hooks_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    await helper.fakeDb.hooks.reset();
    await helper.fakeDb.hooks.hooks_entities_create('foo', 'bar', hooks[0], false, 1);
    await helper.fakeDb.hooks.hooks_entities_create('bar', 'foo', hooks[1], false, 1);
  });

  helper.dbTest('hooks_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.hooks_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(hooks[0], fooClient.value);
  });

  helper.dbTest('hooks_entities_create', async function(db, isFake) {
    const [{ hooks_entities_create: etag }] = await db.fns.hooks_entities_create('baz', 'gamma', hooks[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.hooks_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(hooks[2], bazClient.value);
  });

  helper.dbTest('hooks_entities_create throws when overwrite is false', async function(db, isFake) {
    await db.fns.hooks_entities_create('baz', 'gamma', hooks[2], false, 1);
    await assert.rejects(
      () => db.fns.hooks_entities_create('baz', 'gamma', hooks[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('hooks_entities_create does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.hooks_entities_create('baz', 'gamma', hooks[2], true, 1);
    await db.fns.hooks_entities_create('baz', 'gamma', { ...hooks[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.hooks_entities_load('baz', 'gamma');
    assert.deepEqual({ ...hooks[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('hooks_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.hooks_entities_remove('foo', 'bar');
    const c = await db.fns.hooks_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('hooks_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.hooks_entities_load('foo', 'bar');
    const [etag] = await db.fns.hooks_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.hooks_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('hooks_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.hooks_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.hooks_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('hooks_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.hooks_entities_load('foo', 'bar');
    await db.fns.hooks_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.hooks_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });
});

suite(`${testing.suiteName()} - lastFire3`, function() {
  helper.withDbForProcs({ serviceName: 'hooks' });

  const lastFire3s = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset lastFire3s table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from last_fire3_entities`);
      await client.query(`insert into last_fire3_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    await helper.fakeDb.hooks.reset();
    await helper.fakeDb.hooks.last_fire3_entities_create('foo', 'bar', lastFire3s[0], false, 1);
    await helper.fakeDb.hooks.last_fire3_entities_create('bar', 'foo', lastFire3s[1], false, 1);
  });

  helper.dbTest('last_fire3_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.last_fire3_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(lastFire3s[0], fooClient.value);
  });

  helper.dbTest('last_fire3_entities_create', async function(db, isFake) {
    const [{ last_fire3_entities_create: etag }] = await db.fns.last_fire3_entities_create('baz', 'gamma', lastFire3s[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.last_fire3_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(lastFire3s[2], bazClient.value);
  });

  helper.dbTest('last_fire3_entities throws when overwrite is false', async function(db, isFake) {
    await db.fns.last_fire3_entities_create('baz', 'gamma', lastFire3s[2], false, 1);
    await assert.rejects(
      () => db.fns.last_fire3_entities_create('baz', 'gamma', lastFire3s[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('last_fire3_entities does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.last_fire3_entities_create('baz', 'gamma', lastFire3s[2], true, 1);
    await db.fns.last_fire3_entities_create('baz', 'gamma', { ...lastFire3s[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.last_fire3_entities_load('baz', 'gamma');
    assert.deepEqual({ ...lastFire3s[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('last_fire3_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.last_fire3_entities_remove('foo', 'bar');
    const c = await db.fns.last_fire3_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('last_fire3_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.last_fire3_entities_load('foo', 'bar');
    const [etag] = await db.fns.last_fire3_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.last_fire3_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('last_fire3_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.last_fire3_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.last_fire3_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('last_fire3_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.last_fire3_entities_load('foo', 'bar');
    await db.fns.last_fire3_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.last_fire3_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });

  // TODO : Add test for last_fire3_entities_scan
});

suite.only(`${testing.suiteName()} - queues`, function() {
  helper.withDbForProcs({ serviceName: 'hooks' });

  const queues = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset queues table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from queues_entities`);
      await client.query(`insert into queues_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    await helper.fakeDb.hooks.reset();
    await helper.fakeDb.hooks.queues_entities_create('foo', 'bar', queues[0], false, 1);
    await helper.fakeDb.hooks.queues_entities_create('bar', 'foo', queues[1], false, 1);
  });

  helper.dbTest('queues_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.queues_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(queues[0], fooClient.value);
  });

  helper.dbTest('queues_entities_create', async function(db, isFake) {
    const [{ queues_entities_create: etag }] = await db.fns.queues_entities_create('baz', 'gamma', queues[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.queues_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(queues[2], bazClient.value);
  });

  helper.dbTest('queues_entities_create throws when overwrite is false', async function(db, isFake) {
    await db.fns.queues_entities_create('baz', 'gamma', queues[2], false, 1);
    await assert.rejects(
      () => db.fns.queues_entities_create('baz', 'gamma', queues[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('queues_entities_create does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.queues_entities_create('baz', 'gamma', queues[2], true, 1);
    await db.fns.queues_entities_create('baz', 'gamma', { ...queues[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.queues_entities_load('baz', 'gamma');
    assert.deepEqual({ ...queues[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('queues_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.queues_entities_remove('foo', 'bar');
    const c = await db.fns.queues_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('queues_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.queues_entities_load('foo', 'bar');
    const [etag] = await db.fns.queues_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.queues_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('queues_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.queues_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.queues_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('queues_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.queues_entities_load('foo', 'bar');
    await db.fns.queues_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.queues_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });
});
