const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const Entity = require('taskcluster-lib-entities');
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
    name: Entity.types.String,
    count: Entity.types.Number,
  };
  const configuredTestTable = Entity.configure({
    version: 1,
    signEntities: true,
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.StringKey('name'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('Entity (signEntities)', function() {
    test('Item = ItemV1.setup', function() {
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        signingKey: 'no-way-you-can-guess-this',
      });

      return TestTable.ensureTable();
    });

    test('ItemV1.setup (requires signingKey)', function() {
      try {
        configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      } catch (err) {
        return; // Expected error
      }
      assert(false, 'Expected an error!');
    });

    test('Item.load, item.modify, item.reload()', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        signingKey: 'no-way-you-can-guess-this',
      });
      const id = slugid.v4();

      await TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
      });

      return TestTable.load({
        id: id,
        name: 'my-test-item',
      }).then(function(item) {
        assert(item.count === 1);
        return item.modify(function(item) {
          item.count += 1;
        });
      }).then(function(item) {
        assert(item.count === 2);
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        });
      }).then(function(item) {
        assert(item.count === 2);
        return item.reload().then(function() {
          assert(item.count === 2);
        });
      });
    });

    test('Item.load (missing)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        signingKey: 'no-way-you-can-guess-this',
      });

      return TestTable.load({
        id: slugid.v4(),
        name: 'my-test-item',
      }).then(function() {
        assert(false, 'Expected an error');
      }, function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });

    test('check for stable signature', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = 'ZqZrh4PeQp6eS6alJNANLg';
      const name = 'stable entity';
      const tableName = 'test_entities';
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        signingKey: 'no-way-you-can-guess-this',
      });
      await TestTable.remove({id, name}, true);

      const item = await TestTable.create({
        id,
        name,
        count: 42,
      });

      // overwrite the `data` column with an encrypted value captured from a
      // successful run.  This test then ensures that no changes causes
      // existing rows to no longer decrypt correctly.
      const [result] = await db.fns[`${tableName}_load`](item._partitionKey, item._rowKey);

      assert.equal(result.value.Signature,
        'Ngc8HXokZRUuUJadEPtlYXbDPrV/C52eCR6aviiyLtaxvaV1LrWy0tFOjx0LzsiCd2Tq2dciEtL65cIfK8ohTQ==');
    });

    test('Item.load (invalid signature)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        signingKey: 'no-way-you-can-guess-this',
      });
      const id = slugid.v4();

      await TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
      });

      const BadKeyTestTable = TestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        signingKey: 'wrong-secret',
      });

      return BadKeyTestTable.load({
        id: id,
        name: 'my-test-item',
      }).then(function() {
        assert(false, 'Expected a signature error');
      }, function(err) {
        assert.equal(err.message, ('Signature validation failed!'));
        assert(err, 'Expected a signature error');
      });
    });
  });
});
