const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const Entity = require('taskcluster-lib-entities');
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
      TestTable.create({ id, name: 'item2', count: 2, tag: 'tag2', time: new Date(1), active: false }),
      TestTable.create({ id, name: 'item3', count: 3, tag: 'tag1', time: new Date(1000000000000), active: true }),
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
      result.entries.forEach(entry => {
        sum += entry.count;
      });

      assert.equal(result.entries.length, 3);
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
      result.entries.forEach(entry => {
        sum += entry.count;
      });

      assert.equal(result.entries.length, 3);
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
      }, /conditions should provide enough constraints for constructions of the partition key/);
    });

    test('Query a partition (with limit 2)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      let result = await TestTable.query({ id }, {
        limit: 2,
      });
      assert(result.entries.length === 2);
      assert(result.continuation);
      assert(Entity.continuationTokenPattern.test(result.continuation));

      // Fetch next
      result = await TestTable.query({ id }, {
        limit: 2,
        continuation: result.continuation,
      });
      assert(result.entries.length === 1);
      assert(result.continuation);

      result = await TestTable.query({ id }, {
        limit: 2,
        continuation: result.continuation,
      });
      assert(result.entries.length === 0);
      assert(!result.continuation);
    });

    test('Filter by time === Date(1)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      return TestTable.query({
        id: id,
        time: new Date(1),
      }).then(function(data) {
        assert(data.entries.length === 1);
        assert(data.entries[0].name === 'item2');
      });
    });

    test('Filter by time === Date(1) (with handler)', async function() {
      let sum = 0;
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);

      return TestTable.query({
        id: id,
        time: new Date(1),
      }, {
        handler: function(item) {
          sum += item.count;
        },
      }).then(function() {
        assert(sum === 2);
      });
    });

    test('Filter by time < Date(1)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      return TestTable.query({
        id: id,
        time: Entity.op.lessThan(new Date(1)),
      }).then(function(data) {
        assert(data.entries.length === 1);
        assert(data.entries[0].name === 'item1');
      });
    });

    test('Filter by time < Date(100)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      return TestTable.query({
        id: id,
        time: Entity.op.lessThan(new Date(100)),
      }).then(function(data) {
        assert(data.entries.length === 2);
      });
    });

    test('Filter by time > Date(100)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      return TestTable.query({
        id: id,
        time: Entity.op.greaterThan(new Date(100)),
      }).then(function(data) {
        assert(data.entries.length === 1);
        assert(data.entries[0].name === 'item3');
      });
    });

    test('Filter by active === false throws an error', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      await assert.rejects(
        async () => {
          await TestTable.query({ id, active: false });
        },
        /condition operand can only be a date/,
      );
    });

    test('Query for specific row (matchRow: exact)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      return TestTable.query({
        id: id,
        name: 'item2',
      }, {
        matchRow: 'exact',
      }).then(function(data) {
        assert(data.entries.length === 1);
        data.entries.forEach(function(item) {
          assert(item.tag === 'tag2');
        });
      });
    });

    test('Can\'t use matchRow: exact without row-key', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable);
      return Promise.resolve().then(function() {
        return TestTable.query({
          id: id,
        }, {
          matchRow: 'exact',
        });
      }).then(function() {
        assert(false, 'Expected an error');
      }, function(err) {});
    });
  });
});
