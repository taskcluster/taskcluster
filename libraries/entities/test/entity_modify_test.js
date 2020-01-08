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

  suite('modify', function() {
    test('modify entry', async function() {
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

      assert.equal(result.documentId, documentId);

      const modifiedEntry = {
        ...entry,
        workerType: 'modified',
      };

      await entity.modify(modifiedEntry);

      result = await entity.load(modifiedEntry);

      assert.equal(result.documentId, documentId);
      assert.deepEqual(result.properties, modifiedEntry);
    });
  });
});
