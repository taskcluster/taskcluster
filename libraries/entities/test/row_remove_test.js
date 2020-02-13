const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
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
    id:             Entity.types.String,
    name:           Entity.types.String,
    count:          Entity.types.Number,
  };
  const configuredTestTable = Entity.configure({
    partitionKey:     Entity.keys.StringKey('id'),
    rowKey:           Entity.keys.StringKey('name'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('row remove', function() {
    test('Item.create, item.remove', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });

      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        count:  1,
      }).then(function(item) {
        assert(item instanceof TestTable);
        assert(item.id === id);
        assert(item.count === 1);
        return item.remove();
      }).then(function() {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        });
      }).catch(function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });

    test('Item.create, Item.remove', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        count:  1,
      }).then(function(item) {
        return TestTable.remove({
          id:     id,
          name:   'my-test-item',
        });
      }).then(function() {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        });
      }).catch(function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });

    test('Item.remove (error when doesn\'t exist)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      return TestTable.remove({
        id:     slugid.v4(),
        name:   'my-test-item',
      }).catch(function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });

    test('Item.remove (ignoreIfNotExists)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      return TestTable.remove({
        id:     slugid.v4(),
        name:   'my-test-item',
      }, true);
    });

    test('Item.create, item.remove (abort if changed)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        count:  1,
      }).then(function(itemA) {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        }).then(function(itemB) {
          return itemB.modify(function() {
            this.count += 1;
          });
        }).then(function() {
          return itemA.remove();
        });
      }).catch(function(err) {
        assert(err.code === 'UpdateConditionNotSatisfied');
      });
    });

    test('Item.create, item.remove (ignore changes)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        count:  1,
      }).then(function(itemA) {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        }).then(function(itemB) {
          return itemB.modify(function() {
            this.count += 1;
          });
        }).then(function() {
          return itemA.remove(true);
        });
      });
    });

    test('Item.create, item.remove (ignoreIfNotExists)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        count:  1,
      }).then(function(itemA) {
        return itemA.remove(false, false).then(function() {
          return itemA.remove(false, true);
        });
      });
    });

    test('Item.create, Item.remove (ignoreIfNotExists)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        count:  1,
      }).then(function() {
        return TestTable.remove({
          id:     id,
          name:   'my-test-item',
        }, false).then(function(result) {
          assert(result === true, 'Expected true');
          return TestTable.remove({
            id:     id,
            name:   'my-test-item',
          }, true).then(function(result) {
            assert(result === false, 'Expected false');
          });
        });
      });
    });
  });
});
