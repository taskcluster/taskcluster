const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const path = require('path');
const assert = require('assert').strict;
const slugid = require('slugid');
const crypto = require('crypto');

helper.dbSuite(path.basename(__filename), function() {
  let db;

  teardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
  const properties = {
    id: Entity.types.String,
    name: Entity.types.String,
    data: Entity.types.Blob,
  };
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.StringKey('name'),
    properties,
  });
  const serviceName = 'test-entities';
  const compareBuffers = function(b1, b2) {
    assert(Buffer.isBuffer(b1));
    assert(Buffer.isBuffer(b2));
    if (b1.length !== b2.length) {
      return false;
    }
    const n = b1.length;
    for (let i = 0; i < n; i++) {
      if (b1[i] !== b2[i]) {
        return false;
      }
    }
    return true;
  };

  suite('Entity (BlobType)', function() {
    test('small blob', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const buf = Buffer.from([0, 1, 2, 3]);

      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        data:   buf,
      }).then(function(itemA) {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        }).then(function(itemB) {
          assert(compareBuffers(itemA.data, itemB.data));
        });
      });
    });
    test('large blob (64k)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const buf = crypto.pseudoRandomBytes(64 * 1024);
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        data:   buf,
      }).then(function(itemA) {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        }).then(function(itemB) {
          assert(compareBuffers(itemA.data, itemB.data));
        });
      });
    });

    test('large blob (128k)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const buf = crypto.pseudoRandomBytes(128 * 1024);
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        data:   buf,
      }).then(function(itemA) {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        }).then(function(itemB) {
          assert(compareBuffers(itemA.data, itemB.data));
        });
      });
    });

    test('large blob (256k)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const buf = crypto.pseudoRandomBytes(256 * 1024);
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        data:   buf,
      }).then(function(itemA) {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        }).then(function(itemB) {
          assert(compareBuffers(itemA.data, itemB.data));
        });
      });
    });

    test('too-large blob (512k)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const buf = crypto.pseudoRandomBytes(512 * 1024);
      return assert.rejects(() => TestTable.create({
        id:     id,
        name:   'my-test-item',
        data:   buf,
      }), err => err.code === 'PropertyTooLarge');
    });
  });
});
