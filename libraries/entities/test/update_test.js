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

  suite('update', function() {
    test('update entry', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      const documentId = entity.calculateId(entry);

      entity.setup({ tableName: 'test_entities', db, serviceName });

      await entity.create(entry);

      let result = await entity.load(entry);

      assert.equal(result.length, 1);
      assert.equal(result[0].id, documentId);

      const updatedEntry = {
        ...entry,
        workerType: 'update',
      };

      await entity.update(updatedEntry);

      result = await entity.load(updatedEntry);

      assert.equal(result.length, 1);
      assert.equal(result[0].id, documentId);
      assert.deepEqual(result[0].value, updatedEntry);
    });
  });
});
