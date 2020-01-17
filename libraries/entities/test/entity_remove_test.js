const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
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
  const entity = Entity.configure({
    partitionKey: 'taskId',
    rowKey: 'provisionerId',
    properties,
  });
  const serviceName = 'test-entities';

  suite('entity remove', function() {
    test('remove entry', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const entry = {
        taskId,
        provisionerId,
        workerType: '789',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      await entity.create(entry);

      let result = await entity.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);

      await entity.remove({ taskId, provisionerId });

      await assert.rejects(
        async () => {
          await entity.load({ taskId, provisionerId });
        },
        err => {
          assert.equal(err.code, 'ResourceNotFound');
          assert.equal(err.statusCode, 404);

          return true;
        },
      );
    });
    test('remove entry (ignoreIfNotExists) returns true', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const entry = {
        taskId,
        provisionerId,
        workerType: '789',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      await entity.create(entry);
      const result = await entity.remove(entry, true);

      assert.equal(result, true);
    });
    test('remove entry (ignoreIfNotExists) returns false', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const result = await entity.remove({ taskId, provisionerId }, true);

      assert.equal(result, false);
    });
    test('remove entry (error when doesn\'t exist)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';

      entity.setup({ tableName: 'test_entities', db, serviceName });

      await assert.rejects(
        async () => {
          await entity.remove({ taskId, provisionerId }, false);
        },
        err => {
          assert.equal(err.statusCode, 404);
          assert.equal(err.code, 'ResourceNotFound');

          return true;
        },
      );
    });
  });
});
