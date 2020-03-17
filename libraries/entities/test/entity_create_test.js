const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const Entity = require('taskcluster-lib-entities');
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
    version: 1,
    partitionKey: Entity.keys.StringKey('taskId'),
    rowKey: Entity.keys.StringKey('provisionerId'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('entity create', function() {
    test('create entry', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      const entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      await TestTable.create(entry);

      const result = await TestTable.load({ taskId, provisionerId });

      assert.equal(result.taskId, taskId);
      assert.equal(result.provisionerId, provisionerId);
      assert.deepEqual(result._properties, entry);
      assert(result._etag);
    });

    test('create entry (overwriteIfExists)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await TestTable.create(entry);

      const old = await TestTable.load({ taskId, provisionerId });
      entry = {
        ...entry,
        workerType: 'foo',
      };

      await TestTable.create(entry, true);

      const result = await TestTable.load({ taskId, provisionerId });

      assert.equal(old.workerType, '567');
      assert.equal(result.workerType, 'foo');
      assert.notEqual(old._etag, result._etag);
    });

    test('create entry (overwriteIfExists, doesn\'t exist)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await TestTable.create(entry, true);

      const result = await TestTable.load({ taskId, provisionerId });

      assert.equal(result.workerType, '567');
    });

    test('create entry (won\'t overwrite)', async function () {
      db = await helper.withDb({ schema, serviceName });
      const taskId = '123';
      const provisionerId = '456';
      let entry = {
        taskId,
        provisionerId,
        workerType: '567',
      };

      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await TestTable.create(entry);
      await TestTable.load({ taskId, provisionerId });

      entry = {
        ...entry,
        workerType: 'foo',
      };

      await assert.rejects(
        async () => {
          await TestTable.create(entry, false);
        },
        // already exists
        err => {
          assert.equal(err.code, 'EntityAlreadyExists');

          return true;
        },
      );
    });
  });
});
