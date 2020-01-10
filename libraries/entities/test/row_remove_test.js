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
    rowKey: 'task',
    properties,
  });
  const serviceName = 'test-entities';

  suite('row remove', function() {
    test('remove entry', async function() {
      db = await helper.withDb({ schema, serviceName });

      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      let row = await entity.create(entry);
      await row.remove();

      await assert.rejects(
        async () => {
          await entity.load(entry);
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

      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const row = await entity.create(entry);
      const result = await row.remove(null, true);

      assert.equal(result, true);
    });
    test('remove entry (ignoreIfNotExists) returns false', async function() {
      db = await helper.withDb({ schema, serviceName });

      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const row = await entity.create(entry);
      await entity.remove(entry);
      const result = await row.remove(null, true);

      assert.equal(result, false);
    });
    test('remove entry (error when doesn\'t exist)', async function() {
      db = await helper.withDb({ schema, serviceName });

      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const row = await entity.create(entry);
      await entity.remove(entry);
      await assert.rejects(
        async () => {
          await row.remove(null, false);
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
