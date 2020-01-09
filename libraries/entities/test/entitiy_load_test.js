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
    taskId: 'string',
    provisionerId: 'string',
    workerType: 'string',
  };
  const entity = Entity.configure({
    partitionKey: 'taskId',
    rowKey: 'task',
    properties,
  });
  const serviceName = 'test-entities';

  suite('entity load', function() {
    test('load entry', async function() {
      db = await helper.withDb({ schema, serviceName });

      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      const documentId = entity.calculateId(entry);

      entity.setup({ tableName: 'test_entities', db, serviceName });

      await entity.create(entry);

      const result = await entity.load(entry);

      assert.equal(result.documentId, documentId);
      assert.deepEqual(result.properties, entry);
    });
    test('load entry (throws when not found)', async function() {
      db = await helper.withDb({ schema, serviceName });

      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await assert.rejects(
        async () => {
          await entity.load(entry);
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

      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      entity.setup({ tableName: 'test_entities', db, serviceName });

      const result = await entity.load(entry, true);

      assert.equal(result, null);
    });
  });
});
