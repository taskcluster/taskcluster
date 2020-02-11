const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const testing = require('taskcluster-lib-testing');
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
    time: Entity.types.Date,
  };
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.StringKey('name'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('row modify', function() {
    test('Item.create, Item.modify, Item.load', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
        time: new Date(),
      }).then(function(item) {
        assert(item instanceof TestTable);
        assert(item.id === id);
        assert(item.count === 1);
        return item.modify(function(entry) {
          entry.count += 1;
        }).then(function(item2) {
          assert(item instanceof TestTable);
          assert(item.id === id);
          assert(item.count === 2);
          assert(item2 instanceof TestTable);
          assert(item2.id === id);
          assert(item2.count === 2);
          assert(item === item2);
        });
      }).then(function() {
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        });
      }).then(function(item) {
        assert(item instanceof TestTable);
        assert(item.id === id);
        assert(item.count === 2);
      });
    });

    test('Item.create, Item.modify, throw error', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      const err = new Error('Testing that errors in modify works');

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
        time: new Date(),
      }).then(function(item) {
        return item.modify(function() {
          throw err;
        });
      }).then(function() {
        assert(false, 'Expected an error');
      }, function(err2) {
        assert(err === err2, 'Expected the error I threw!');
      });
    });

    test('Item.modify a deleted item', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      let deletedItem;
      return TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
        time: new Date(),
      }).then(function(item) {
        deletedItem = item;
        return TestTable.remove({id: id, name: 'my-test-item'});
      }).then(function() {
        return deletedItem.modify(function(item) {
          item.count += 1;
        });
      }).then(function() {
        assert(false, 'Expected an error');
      }, function(err) {
        assert(err.code === 'ResourceNotFound', 'Expected ResourceNotFound');
        assert(err.statusCode === 404, 'Expected 404');
      });
    });

    test('Item.create, Item.modify (first argument), Item.load', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      return TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
        time: new Date(),
      }).then(function(item) {
        assert(item instanceof TestTable);
        assert(item.id === id);
        assert(item.count === 1);
        return item.modify(function(item) {
          item.count += 1;
        });
      }).then(function(item) {
        assert(item instanceof TestTable);
        assert(item.id === id);
        assert(item.count === 2);
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        });
      }).then(function(item) {
        assert(item instanceof TestTable);
        assert(item.id === id);
        assert(item.count === 2);
      });
    });

    test('Item.modify (concurrent)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      return TestTable.create({
        id:     id,
        name:   'my-test-item',
        count:  1,
        time:   new Date(),
      }).then(function(itemA) {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        }).then(function(itemB) {
          return Promise.all([
            itemA.modify(function() {
              this.count += 1;
            }),
            itemB.modify(function() {
              this.count += 1;
            }),
          ]);
        });
      }).then(function() {
        return TestTable.load({
          id:     id,
          name:   'my-test-item',
        });
      }).then(function(item) {
        assert(item instanceof TestTable);
        assert(item.id === id);
        assert(item.count === 3);
      });
    });

    // TODO: 2 transactions that are running updates on the same row at the same time
  });
});
