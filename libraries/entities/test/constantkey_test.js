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
  const serviceName = 'test-entities';

  suite('Entity (ConstantKey)', function() {
    const properties = {
      data: Entity.types.Number,
    };
    const configuredTestTable = Entity.configure({
      partitionKey: Entity.keys.ConstantKey(slugid.v4()),
      rowKey: Entity.keys.ConstantKey(slugid.v4()),
      properties,
    });

    test('Entity.create, Entity.load (without properties)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });

      return TestTable.create({
        data: 42,
      }).then(function(itemA) {
        return TestTable.load().then(function(itemB) {
          assert(itemA.data === itemB.data);
          assert(itemB.data === 42);
        });
      });
    });
  });

  suite('Entity (ConstantKey + CompositeKey)', function() {
    const properties = {
      taskId: Entity.types.SlugId,
      runId: Entity.types.Number,
      data: Entity.types.Number,
    };
    const configuredTestTable = Entity.configure({
      partitionKey: Entity.keys.CompositeKey('taskId', 'runId'),
      rowKey: Entity.keys.ConstantKey('task-info'),
      properties,
    });

    test('Entity.create, Item.load (combined with CompositeKey)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const id = slugid.v4();

      return TestTable.create({
        taskId: id,
        runId: 0,
        data: 42,
      }).then(function(itemA) {
        return TestTable.load({
          taskId: id,
          runId: 0,
        }).then(function(itemB) {
          assert(itemA.data === itemB.data);
          assert(itemB.data === 42);
        });
      });
    });
  });
});
