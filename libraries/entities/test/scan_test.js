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

  function insertDocuments(num) {
    return [...new Array(num)].map((_, i) => (
      entity.create({
        taskId: i,
        provisionerId: `provisionerId-${i}`,
        workerType: `workerType-${i}`,
      })
    ));
  }

  suite('scan', function() {
    test('retrieve all documents', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await Promise.all(insertDocuments(10));
      const result = await entity.scan();

      assert.equal(result.rows.length, 10);
    });
    test('retrieve documents with filter', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await Promise.all(insertDocuments(10));

      const result = await entity.scan({
        filter: entry => Boolean(entry.value.taskId === 1)
      });

      assert.equal(result.rows.length, 1);
      assert.equal(result.pageCount, 1);
    });
    test('retrieve documents from pages and with filter', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await Promise.all(insertDocuments(10));

      const limit = 2;
      const filter = entry => Boolean(entry.value.taskId % 2 === 0);
      let result = await entity.scan({
        limit,
        filter,
      });

      assert.equal(result.pageCount, 3);
      assert.equal(result.rowCount, limit);
      assert.equal(result.page, 1);

      result = await entity.scan({
        limit,
        filter,
        page: 2
      });

      assert.equal(result.pageCount, 3);
      assert.equal(result.rowCount, limit);
      assert.equal(result.page, 2);

      result = await entity.scan({
        limit,
        filter,
        page: 3
      });

      assert.equal(result.pageCount, 3);
      assert.equal(result.rowCount, 1);
      assert.equal(result.page, 3);
    });
    test('retrieve non-existent page', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await Promise.all(insertDocuments(10));

      const result = await entity.scan({ page: 99 });

      assert.equal(result.rowCount, 0);
    });
    test('retrieve page count', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      await Promise.all(insertDocuments(10));
      const result = await entity.scan({ limit: 3 });

      assert.equal(result.pageCount, 4);
      assert.equal(result.rows.length, 3);
    });
    test('retrieve page count (when no entries in db))', async function() {
      db = await helper.withDb({ schema, serviceName });
      entity.setup({ tableName: 'test_entities', db, serviceName });

      const result = await entity.scan({ limit: 3 });

      assert.equal(result.pageCount, 0);
      assert.equal(result.rows.length, 0);
    });
  });
});
