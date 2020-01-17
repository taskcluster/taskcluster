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

  suite('modify', function() {
    test('modify entry', async function() {
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

      const modifiedEntry = {
        ...entry,
        workerType: 'modified',
      };

      await entity.modify(modifiedEntry);

      result = await entity.load({ taskId: modifiedEntry.taskId, provisionerId: modifiedEntry.provisionerId });

      assert.equal(result.workerType, modifiedEntry.workerType);
    });
  });
});
