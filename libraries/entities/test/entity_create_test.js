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
  const entity = Entity.configure({
    partitionKey: 'taskId',
    rowKey: 'task',
    properties,
  });
  const serviceName = 'test-entities';

  suite('entity create', function() {
    test('create entity', async function() {
      const entity = Entity.configure({
        partitionKey: 'taskId',
        rowKey: 'task',
        properties,
      });

      assert.equal(entity.properties, properties);
      assert.equal(entity.rowKey, 'task');
      assert.equal(entity.partitionKey, 'taskId');
    });
    test('create entry', async function() {
      db = await helper.withDb({ schema, serviceName });
      const entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });
      await entity.create(entry);

      const result = await entity.load(entry);

      assert.equal(result.documentId, entity.calculateId(entry));
      assert.deepEqual(result.properties, entry);
      assert(result.etag);
    });

    test('create entry (overwriteIfExists)', async function() {
      db = await helper.withDb({ schema, serviceName });
      let entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });
      await entity.create(entry);

      const old = await entity.load(entry);
      entry = {
        ...entry,
        workerType: 'foo',
      };

      await entity.create(entry, true);

      const result = await entity.load(entry);

      assert.equal(old.properties.workerType, 'string');
      assert.equal(result.properties.workerType, 'foo');
      assert.deepEqual(result.properties, entry);
      assert.notEqual(old.etag, result.etag);
    });

    test('create entry (overwriteIfExists, doesn\'t exist)', async function() {
      db = await helper.withDb({ schema, serviceName });
      let entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });
      await entity.create(entry, true);

      const result = await entity.load(entry);

      assert.equal(result.properties.workerType, 'string');
      assert.deepEqual(result.properties, entry);
    });

    test('create entry (won\'t overwrite)', async function () {
      db = await helper.withDb({ schema, serviceName });
      let entry = {
        taskId: 'taskId',
        provisionerId: 'provisionerId',
        workerType: 'string',
      };

      entity.setup({ tableName: 'test_entities', db, serviceName });
      await entity.create(entry);
      await entity.load(entry);

      entry = {
        ...entry,
        workerType: 'foo',
      };

      await assert.rejects(
        async () => {
          await entity.create(entry, false);
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
