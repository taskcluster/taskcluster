const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const Entity = require('taskcluster-lib-entities');
const path = require('path');
const assert = require('assert').strict;

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
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('taskId'),
    rowKey: Entity.keys.StringKey('provisionerId'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('entity load', function() {
    test('load entry', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const entry = {
        taskId,
        provisionerId,
        workerType: '789',
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await TestTable.create(entry);

      const result = await TestTable.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);
    });
    test('load entry (throws when not found)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await assert.rejects(
        async () => {
          await TestTable.load({ taskId, provisionerId });
        },
        (err => {
          assert.equal(err.code, "ResourceNotFound");
          assert.equal(err.statusCode, 404);

          return true;
        }),
      );
    });
    test('load entry (ignoreIfNotExists)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const result = await TestTable.load({ taskId, provisionerId }, true);

      assert.equal(result, null);
    });
  });
});
