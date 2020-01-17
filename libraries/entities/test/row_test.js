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
    partitionKey: Entity.keys.StringKey('taskId'),
    rowKey: Entity.keys.StringKey('provisionerId'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('row', function() {
    test('can access properties defined in Entity.configure()', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      await entity.create(entry);

      const result = await entity.load({ taskId, provisionerId });

      assert.equal(result.taskId, entry.taskId);
      assert.equal(result.provisionerId, entry.provisionerId);
      assert.equal(result.workerType, entry.workerType);
    });
  });
});
