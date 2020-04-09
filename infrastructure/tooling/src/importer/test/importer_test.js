const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const Entity = require('taskcluster-lib-entities');
const path = require('path');
const assert = require('assert').strict;
const { verifyWithPostgres, writeToPostgres } = require('../util');

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
  const serviceName = 'test-entities';
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

  suite('util', function() {
    test('verifyWithPostgres works', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: '123',
        workerType: '567',
        provisionerId: '456',
      };
      const azureEntities = [{
        RowKey: '456',
        PartitionKey: '123',
        ...entry,
      }];
      const allowedTables = ['test'];
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });

      await TestTable.create(entry);
      await verifyWithPostgres('test', azureEntities, db, allowedTables, 'write');
    });

    test('verifyWithPostgres throws when not equal', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: '123',
        workerType: '567',
        provisionerId: '456',
      };
      const azureEntities = [{
        RowKey: 'not-equal',
        PartitionKey: '123',
        ...entry,
      }];
      const allowedTables = ['test'];
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });

      await TestTable.create(entry);
      await assert.rejects(
        async () => {
          await verifyWithPostgres('test', azureEntities, db, allowedTables, 'write');
        },
      );
    });

    test('writeToPostgres works', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: '123',
        workerType: '567',
        provisionerId: '456',
      };
      const azureEntities = [{
        PartitionKey: '123',
        RowKey: '456',
        ...entry,
      }];
      const allowedTables = ['test'];
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });

      await writeToPostgres('test', azureEntities, db, allowedTables, 'write');
      const result = await TestTable.load({ taskId: '123', provisionerId: '456' });
      assert.equal(result.taskId, entry.taskId);
      assert.equal(result.provisionerId, entry.provisionerId);
    });
  });
});
