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

  suite('row modify', function() {
    test('modify entry (synchronous modifier)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      let result = await entity.load({ taskId, provisionerId });

      assert.equal(result.workerType, entry.workerType);

      await createdEntry.modify((entry) => {
        entry.workerType = 'foo';
      });

      result = await entity.load({ taskId, provisionerId });

      assert.deepEqual(result.properties.workerType, 'foo');
    });
    test('modify entry without argument (synchronous modifier)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      await createdEntry.modify(function (){
        this.workerType = 'foo';
      });

      const result = await entity.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);
      assert.equal(result.workerType, 'foo');
    });
    test('modify entry (asynchronous modifier)', async function () {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      await createdEntry.modify(async (entry) => {
        await testing.sleep(100);
        entry.workerType = 'foo';
      });

      const result = await entity.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);
      assert.equal(result.workerType, 'foo');
    });
    test('modify entry without argument (asynchronous modifier)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await entity.create(entry);

      await createdEntry.modify(async function () {
        await testing.sleep(100);
        this.workerType = 'foo';
      });

      const result = await entity.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);
      assert.equal(result.workerType, 'foo');
    });
  });
});
