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

  suite('create', function() {
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

    assert.equal(result.length, 1);
    assert.equal(result[0].id, entity.calculateId(entry));
    assert.deepEqual(result[0].value, entry);
    assert(result[0].etag);
    assert(result[0].version);
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

    assert.equal(old.length, 1);
    assert.equal(result.length, 1);
    assert.equal(old[0].value.workerType, 'string');
    assert.equal(result[0].value.workerType, 'foo');
    assert.deepEqual(result[0].value, entry);
    assert.notEqual(old[0].etag, result[0].etag);
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

    assert.equal(result.length, 1);
    assert.equal(result[0].value.workerType, 'string');
    assert.deepEqual(result[0].value, entry);
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
    await entity.load(entity.calculateId(entry));

    entry = {
      ...entry,
      workerType: 'foo',
    };

    await assert.rejects(
      async () => {
        await entity.create(entry, false);
      },
      // already exists
      err => err.code === 'EntityAlreadyExists',
    );
  });
});
