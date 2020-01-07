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

  async function insertDocuments(num) {
    const documents = [];
    for (let i = 0; i < num; i++) {
      const entry = await entity.create({
        taskId: i,
        provisionerId: `provisionerId-${i}`,
        workerType: `workerType-${i}`,
      });

      documents.push(entry);
    }

    return documents;
  }

  suite('scan', function() {
    test('retrieve all documents', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(10);
      const result = await entity.scan();

      assert.equal(result.length, 10);
    });
    test('retrieve documents (with limit)', async function () {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(10);
      const result = await entity.scan({ limit: 4 });

      assert.equal(result.length, 4);
    });
    test('retrieve all documents (with condition)', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(10);

      const result = await entity.scan({ condition: 'value @> \'{"taskId": 9}\' and version = 1' });

      assert.equal(result.length, 1);
      assert.deepEqual(result[0].value.taskId, 9);
    });
    test('retrieve documents in pages', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      const documents = await insertDocuments(10);

      let result = await entity.scan({
        page: 1,
        limit: 4,
      });

      assert.equal(result.length, 4);
      assert.deepEqual(result[0].value, documents[0].properties);
      assert.deepEqual(result[1].value, documents[1].properties);
      assert.deepEqual(result[2].value, documents[2].properties);
      assert.deepEqual(result[3].value, documents[3].properties);

      result = await entity.scan({
        page: 2,
        limit: 4,
      });

      assert.equal(result.length, 4);
      assert.deepEqual(result[0].value, documents[4].properties);
      assert.deepEqual(result[1].value, documents[5].properties);
      assert.deepEqual(result[2].value, documents[6].properties);
      assert.deepEqual(result[3].value, documents[7].properties);

      result = await entity.scan({
        page: 3,
        limit: 4,
      });

      assert.equal(result.length, 2);
      assert.deepEqual(result[0].value, documents[8].properties);
      assert.deepEqual(result[1].value, documents[9].properties);

      result = await entity.scan({
        page: 4,
        limit: 4,
      });
      assert.equal(result.length, 0);
    });
  });
});
