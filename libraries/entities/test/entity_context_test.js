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
  const serviceName = 'test-entities';

  suite('entity (context)', function() {
    test('Entity.configure().setup()', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entity = Entity.configure({
        partitionKey: 'taskId',
        rowKey: 'provisionerId',
        properties,
      });
      entity.setup({ tableName: 'test_entities', db, serviceName });
    });

    test('Entity.configure().setup() with context', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entity = Entity.configure({
        partitionKey: 'taskId',
        rowKey: 'provisionerId',
        properties,
        context: ['config', 'maxCount'],
      });
      entity.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        context: { config: 'My config object', maxCount: 10 },
      });
    });
    test('Entity.create() with context', async function() {
      db = await helper.withDb({ schema, serviceName });
      let entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };
      const entity = Entity.configure({
        partitionKey: 'taskId',
        rowKey: 'provisionerId',
        properties,
        context: ['config', 'maxCount'],
      });
      entity.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        context: { config: 'My config object', maxCount: 10 },
      });

      const createdEntry = await entity.create(entry);

      assert.equal(createdEntry.config, 'My config object', 'Missing config from context');
      assert.equal(createdEntry.maxCount, 10, 'Missing maxCount from context');
    });
    test('Entity.configure().setup() with undeclared context', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entity = Entity.configure({
        partitionKey: 'taskId',
        rowKey: 'provisionerId',
        properties,
        context: ['config'],
      });
      assert.throws(() => {
        entity.setup({
          tableName: 'test_entities',
          db,
          serviceName,
          context: { config: 'My config object', undeclaredKey: 19 },
        });
      }, /context key undeclaredKey was not declared in Entity.configure/);
    });
    test('Entity.configure().setup() with missing context', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entity = Entity.configure({
        partitionKey: 'taskId',
        rowKey: 'provisionerId',
        properties,
        context: ['config'],
      });
      assert.throws(() => {
        entity.setup({
          tableName: 'test_entities',
          db,
          serviceName,
          context: {},
        });
      }, /context key config must be specified/);
    });
    test('Entity.configure() context cannot overwrite RowClass methods', async function() {
      db = await helper.withDb({ schema, serviceName });

      ['remove', 'modify', 'reload'].forEach(key => {
        assert.throws(
          () => {
            Entity.configure({
              partitionKey: 'taskId',
              rowKey: 'provisionerId',
              properties,
              context: [key],
            });
          },
          /is reserved and cannot be specified in context/,
        );
      });
    });
  });
});
