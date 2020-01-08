const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const testing = require('taskcluster-lib-testing');
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

  suite('row modify', function() {
    test('modify entry (synchronous modifier)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      const documentId = entity.calculateId(entry);

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      let result = await entity.load(entry);

      assert.equal(result.documentId, documentId);

      await createdEntry.modify((entry) => {
        entry.workerType = 'foo';
      });

      result = await entity.load(entry);

      assert.equal(result.documentId, documentId);
      assert.deepEqual(result.properties.workerType, 'foo');
    });
    test('modify entry without argument (synchronous modifier)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      const documentId = entity.calculateId(entry);

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      let result = await entity.load(entry);

      assert.equal(result.documentId, documentId);

      await createdEntry.modify(function (){
        this.workerType = 'foo';
      });

      result = await entity.load(entry);

      assert.equal(result.documentId, documentId);
      assert.deepEqual(result.properties.workerType, 'foo');
    });
    test('modify entry (asynchronous modifier)', async function () {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      const documentId = entity.calculateId(entry);

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      let result = await entity.load(entry);

      assert.equal(result.documentId, documentId);

      await createdEntry.modify(async (entry) => {
        await testing.sleep(100);
        entry.workerType = 'foo';
      });

      result = await entity.load(entry);

      assert.equal(result.documentId, documentId);
      assert.deepEqual(result.properties.workerType, 'foo');
    });
    test('modify entry without argument (asynchronous modifier)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      const documentId = entity.calculateId(entry);

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      let result = await entity.load(entry);

      assert.equal(result.documentId, documentId);

      await createdEntry.modify(async function () {
        await testing.sleep(100);
        this.workerType = 'foo';
      });

      result = await entity.load(entry);

      assert.equal(result.documentId, documentId);
      assert.deepEqual(result.properties.workerType, 'foo');
    });
  });
});
