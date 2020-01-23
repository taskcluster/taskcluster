const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const path = require('path');
const assert = require('assert').strict;
const slugid = require('slugid');

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
    id: Entity.types.String,
    name: Entity.types.String,
    count: Entity.types.Number,
    tag: Entity.types.String,
    time: Entity.types.Date,
    active: Entity.types.Boolean,
  };
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.StringKey('name'),
    properties,
  });
  const serviceName = 'test-entities';
  const id = slugid.v4();

  function insertDocuments(TestTable) {
    return Promise.all([
      TestTable.create({ id, name: 'item1', count: 1, tag: 'tag1', time: new Date(0), active: true }),
      TestTable.create({ id, name: 'item2', count: 2, tag: 'tag2', time: new Date(0), active: false }),
      TestTable.create({ id, name: 'item3', count: 3, tag: 'tag1', time: new Date(0), active: true }),
    ]);
  }

  suite('query', function() {
    test('query a partition', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);

      const result = await TestTable.query({
        id,
      });

      let sum = 0;
      result.forEach(entry => {
        sum += entry.count;
      });

      assert.equal(result.length, 3);
      assert.equal(sum, 6);
    });
    test('query a partition (with Entity.op.equal)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);

      const result = await TestTable.query({
        id: Entity.op.equal(id),
      });

      let sum = 0;
      result.forEach(entry => {
        sum += entry.count;
      });

      assert.equal(result.length, 3);
      assert.equal(sum, 6);
    });
    test('can\'t query without partition-key', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);

      await assert.rejects(async () => {
        await TestTable.query({
          name: 'item1',
          count: 1,
          tag: 'tag1',
        });
      }, /should provide enough constraints/);
    });
    // TODO: Add more tests...
  });
});
