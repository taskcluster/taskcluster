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

  suite('row reload', function() {
    test('reload entry (no changes should return false)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createResult = await entity.create(entry);
      const result = await createResult.reload();

      assert.equal(result, false);
    });

    test('reload entry (changes should return true)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createResult = await entity.create(entry);

      await entity.modify({ ...entry, workerType: 'foo' });

      const result = await createResult.reload();

      assert.equal(result, true);
    });
  });
});
