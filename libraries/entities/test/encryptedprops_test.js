const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const crypto = require('crypto');
const path = require('path');
const assert = require('assert').strict;
const slugid = require('slugid');

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
    count: Entity.types.EncryptedJSON,
  };
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.ConstantKey('enc-props-test'),
    properties,
  });
  const serviceName = 'test-entities';
  const cryptoKey = 'CNcj2aOozdo7Pn+HEkAIixwninIwKnbYc6JPS9mNxZk=';

  suite('Entity (encrypted properties)', function() {
    test('setup', function() {
      configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });
    });

    test('setup (requires cryptoKey)', function() {
      try {
        configuredTestTable.setup({
          tableName: 'test_entities',
          db,
          serviceName,
        });
      } catch (err) {
        return; // Expected error
      }
      assert(false, 'Expected an error!');
    });

    test('setup (cryptoKey < 32 bytes doesn\'t work)', function() {
      try {
        configuredTestTable.setup({
          tableName: 'test_entities',
          db,
          serviceName,
          cryptoKey: crypto.randomBytes(31).toString('base64'),
        });
      } catch (err) {
        return; // Expected error
      }
      assert(false, 'Expected an error!');
    });

    test('setup (cryptoKey > 32 bytes doesn\'t work)', function() {
      try {
        configuredTestTable.setup({
          tableName: 'test_entities',
          db,
          serviceName,
          cryptoKey: crypto.randomBytes(33).toString('base64'),
        });
      } catch (err) {
        return; // Expected error
      }
      assert(false, 'Expected an error!');
    });

    test('configuredTestTable.setup (requires cryptoKey in base64)', function() {
      try {
        configuredTestTable.setup({
          tableName: 'test_entities',
          db,
          serviceName,
          // Notice: ! below
          cryptoKey: 'CNcj2aOozdo7Pn+HEkAIixwninIwKnbYc6JPS9mNxZ!=',
        });
      } catch (err) {
        return; // Expected error
      }
      assert(false, 'Expected an error!');
    });

    test('TestTable.create', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });

      return TestTable.create({
        id: id,
        count: 1,
      });
    });

    test.skip('Item.load, item.modify, item.reload()', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });

      await TestTable.create({
        id: id,
        count: 1,
      });

      return TestTable.load({
        id: id,
      }).then(function(item) {
        assert(item.count === 1);
        return item.modify(function(item) {
          item.count += 1;
        });
      }).then(function(item) {
        assert(item.count === 2);
        return TestTable.load({
          id: id,
        });
      }).then(function(item) {
        assert(item.count === 2);
        return item.reload().then(function() {
          assert(item.count === 2);
        });
      });
    });

    test('Entity.load (missing)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });

      await TestTable.create({
        id: slugid.v4(),
        count: 1,
      });

      return TestTable.load({
        id: slugid.v4(),
      }).then(function() {
        assert(false, 'Expected an error');
      }, function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });

    test('Entity.load (invalid cryptoKey)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const BadKeyItem = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey: crypto.randomBytes(32).toString('base64'),
      });

      return BadKeyItem.load({
        id,
      }).then(function() {
        assert(false, 'Expected a decryption error');
      }, function(err) {
        assert(err, 'Expected a decryption error');
      });
    });
  });
});
