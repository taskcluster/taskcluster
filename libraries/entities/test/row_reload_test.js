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
    id: Entity.types.String,
    name: Entity.types.String,
    count: Entity.types.Number,
  };
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.StringKey('name'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('row reload', function() {
    test('Item.create, item.reload', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      const id = slugid.v4();

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
      }).then(function(item) {
        return item.reload();
      });
    });

    test('Item.create, item.modify, item.reload', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        count: 1,
      }).then(function(itemA) {
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        }).then(function(itemB) {
          assert(itemA !== itemB);
          return itemB.modify(function() {
            this.count += 1;
          });
        }).then(function() {
          assert(itemA.count === 1);
          return itemA.reload();
        }).then(function(updated) {
          assert(updated);
          assert(itemA.count === 2);
        }).then(function() {
          return itemA.reload();
        }).then(function(updated) {
          assert(!updated);
          assert(itemA.count === 2);
        });
      });
    });
  });
});
