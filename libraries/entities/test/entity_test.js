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
    taskId: Entity.types.String,
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
  };
  const serviceName = 'test-entities';

  suite('entity', function() {
    test('Entity.configure() can add a class-level method', async function() {
      db = await helper.withDb({ schema, serviceName });
      const configuredTestTable = Entity.configure({
        version: 1,
        partitionKey: Entity.keys.StringKey('taskId'),
        rowKey: Entity.keys.StringKey('provisionerId'),
        properties,
      });

      configuredTestTable.testMethod = function() {
        return true;
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      assert.equal(typeof TestTable.testMethod, 'function');
      assert.equal(TestTable.testMethod(), true);
    });
    test('Entity.configure() can add an instance-level method', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };
      const configuredTestTable = Entity.configure({
        version: 1,
        partitionKey: Entity.keys.StringKey('taskId'),
        rowKey: Entity.keys.StringKey('provisionerId'),
        properties,
      });

      configuredTestTable.prototype.testMethod = function() {
        return true;
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await TestTable.create(entry);

      const result = await TestTable.load({ taskId, provisionerId });

      assert.equal(typeof result.testMethod, 'function');
      assert.equal(result.testMethod(), true);
    });
    test('Entity.configure() can be called multiple times', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const slugId = slugid.v4();
      const configuredTestTable = Entity
        .configure({
          version: 1,
          partitionKey: Entity.keys.StringKey('taskId'),
          rowKey: Entity.keys.StringKey('provisionerId'),
          properties,
        })
        .configure({
          version: 2,
          properties: {
            ...properties,
            workerType: Entity.types.SlugId,
          },
        });
      const entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      configuredTestTable.testMethod = function() {
        return true;
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      assert.rejects(async () => {
        await TestTable.create(entry);
      }, /expected a slugid/);
      await TestTable.create({
        ...entry,
        workerType: slugId,
      });
      const result = await TestTable.load({ taskId, provisionerId });

      assert.equal(typeof TestTable.testMethod, 'function');
      assert.equal(TestTable.testMethod(), true);
      assert.equal(result.workerType, slugId);
    });
  });
});
