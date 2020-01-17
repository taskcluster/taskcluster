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
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('taskId'),
    rowKey: Entity.keys.StringKey('provisionerId'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('row modify', function() {

    test('modify entry', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const entry = {
        taskId,
        provisionerId,
        workerType: '789',
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await TestTable.create(entry);

      let result = await TestTable.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);

      await result.modify(row => row.workerType = 'modified');

      result = await TestTable.load({ taskId, provisionerId });

      assert.equal(result.workerType, 'modified');
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

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await TestTable.create(entry);

      await createdEntry.modify(function (){
        this.workerType = 'foo';
      });

      const result = await TestTable.load({ taskId, provisionerId });

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

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await TestTable.create(entry);

      await createdEntry.modify(async (entry) => {
        await testing.sleep(100);
        entry.workerType = 'foo';
      });

      const result = await TestTable.load({ taskId, provisionerId });

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

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const createdEntry = await TestTable.create(entry);

      await createdEntry.modify(async function () {
        await testing.sleep(100);
        this.workerType = 'foo';
      });

      const result = await TestTable.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);
      assert.equal(result.workerType, 'foo');
    });
  });
});
