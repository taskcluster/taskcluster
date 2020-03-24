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
  const serviceName = 'test-entities';

  suite('scan', function() {
    const properties = {
      taskId: Entity.types.String,
      provisionerId: Entity.types.String,
      workerType: Entity.types.String,
      expires: Entity.types.Date,
    };
    const configuredTestTable = Entity.configure({
      version: 1,
      partitionKey: Entity.keys.StringKey('taskId'),
      rowKey: Entity.keys.StringKey('provisionerId'),
      properties,
    });

    async function insertDocuments(TestTable, num) {
      const documents = [];
      for (let i = 0; i < num; i++) {
        const entry = await TestTable.create({
          taskId: `${i}`,
          provisionerId: `provisionerId-${i}`,
          workerType: `workerType-${i}`,
          expires: new Date(),
        });

        documents.push(entry);
      }

      return documents;
    }

    test('retrieve all on empty db', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const result = await TestTable.scan();

      assert(result.entries instanceof Array);
      assert.equal(result.entries.length, 0);
    });
    test('retrieve all documents (condition set to undefined)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);
      const result = await TestTable.scan();

      assert.equal(result.entries.length, 10);
    });
    test('retrieve all documents (condition set to null)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);
      const result = await TestTable.scan(null);

      assert.equal(result.entries.length, 10);
    });
    test('retrieve documents (with limit)', async function () {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);
      const result = await TestTable.scan(null, { limit: 4 });

      assert.equal(result.entries.length, 4);
    });
    test('retrieve all documents (with condition)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);

      const result = await TestTable.scan({
        taskId: Entity.op.equal('9'),
        provisionerId: Entity.op.equal('provisionerId-9'),
      });

      assert.equal(result.entries.length, 1);
      assert.deepEqual(result.entries[0].taskId, '9');
    });
    test('retrieve documents (with equality date condition)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      const document = { provisionerId: 'test', workerType: 'test' };
      await TestTable.create({ ...document, taskId: '1', expires: new Date('2020-01-01') });
      await TestTable.create({ ...document, taskId: '2', expires: new Date('3020-01-01') });
      await TestTable.create({ ...document, taskId: '3', expires: new Date('4020-01-01') });

      const result = await TestTable.scan({
        expires: Entity.op.equal(new Date('2020-01-01')),
      });

      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].taskId, '1');
      assert.equal(result.entries[0].expires.toJSON(), new Date('2020-01-01').toJSON());
    });
    test('retrieve documents (with comparison date condition)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      const document = { provisionerId: 'test', workerType: 'test' };
      await TestTable.create({ ...document, taskId: '1', expires: new Date('2020-01-01') });
      await TestTable.create({ ...document, taskId: '2', expires: new Date('3020-01-01') });
      await TestTable.create({ ...document, taskId: '3', expires: new Date('4020-01-01') });

      const result = await TestTable.scan({
        expires: Entity.op.greaterThan(new Date('3020-01-01')),
      });

      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].taskId, '3');
      assert.equal(result.entries[0].expires.toJSON(), new Date('4020-01-01').toJSON());
    });

    test('retrieve documents in pages', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const documents = await insertDocuments(TestTable, 10);

      let result = await TestTable.scan(null, {
        limit: 4,
      });

      assert.equal(result.entries.length, 4);
      assert.deepEqual(result.entries[0], documents[0]);
      assert.deepEqual(result.entries[1], documents[1]);
      assert.deepEqual(result.entries[2], documents[2]);
      assert.deepEqual(result.entries[3], documents[3]);

      result = await TestTable.scan(null, {
        continuation: result.continuation,
        limit: 4,
      });

      assert.equal(result.entries.length, 4);
      assert.deepEqual(result.entries[0], documents[4]);
      assert.deepEqual(result.entries[1], documents[5]);
      assert.deepEqual(result.entries[2], documents[6]);
      assert.deepEqual(result.entries[3], documents[7]);

      result = await TestTable.scan(null, {
        continuation: result.continuation,
        limit: 4,
      });

      assert.equal(result.entries.length, 2);
      assert.deepEqual(result.entries[0], documents[8]);
      assert.deepEqual(result.entries[1], documents[9]);
      assert(!result.continuation);
    });

    test('retrieve documents with continuation but no limit', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const documents = await insertDocuments(TestTable, 2);

      let result = await TestTable.scan(null, {
        limit: 1,
      });

      assert.equal(result.entries.length, 1);
      assert.deepEqual(result.entries[0], documents[0]);

      result = await TestTable.scan(null, {
        continuation: result.continuation,
      });

      assert.equal(result.entries.length, 1);
      assert.deepEqual(result.entries[0], documents[1]);
      assert(!result.continuation);
    });
  });

  suite('scan compositekey', function() {
    const properties = {
      text1: Entity.types.String,
      text2: Entity.types.String,
      id: Entity.types.String,
      data: Entity.types.Number,
      expires: Entity.types.Date,
    };
    const configuredTestTable = Entity.configure({
      version: 1,
      partitionKey: Entity.keys.CompositeKey('id', 'data'),
      rowKey: Entity.keys.CompositeKey('text1', 'text2'),
      properties,
    });

    async function insertDocuments(TestTable, num) {
      const documents = [];
      for (let i = 0; i < num; i++) {
        const entry = await TestTable.create({
          expires: new Date(),
          id: `${i}`,
          data: 42,
          text1: `some text for the key-${i}`,
          text2: `another string for the key-${i}`,
        });

        documents.push(entry);
      }

      return documents;
    }

    test('retrieve all documents (condition set to undefined)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);
      const result = await TestTable.scan();

      assert.equal(result.entries.length, 10);
    });

    test('retrieve all documents (condition set to null)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);
      const result = await TestTable.scan(null);

      assert.equal(result.entries.length, 10);
    });

    test('retrieve documents (with limit)', async function () {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);
      const result = await TestTable.scan(null, { limit: 4 });

      assert.equal(result.entries.length, 4);
    });

    test('retrieve all documents (with condition)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      await insertDocuments(TestTable, 10);

      const result = await TestTable.scan({
        id: '1',
        data: 42,
        text1: 'some text for the key-1',
        text2: 'another string for the key-1',
      });

      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].id, '1');
      assert.equal(result.entries[0].data, 42);
      assert.equal(result.entries[0].text1, 'some text for the key-1');
      assert.equal(result.entries[0].text2, 'another string for the key-1');
    });

    test('retrieve documents (with date condition)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      const document = { data: 42, text1: 'text 1', text2: 'text2' };
      await TestTable.create({ ...document, id: '1', expires: new Date('2020-01-01') });
      await TestTable.create({ ...document, id: '2', expires: new Date('3020-01-01') });
      await TestTable.create({ ...document, id: '3', expires: new Date('4020-01-01') });

      const result = await TestTable.scan({
        expires: Entity.op.equal(new Date('2020-01-01')),
      });

      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].id, '1');
      assert.equal(result.entries[0].expires.toJSON(), new Date('2020-01-01').toJSON());
    });

    test('retrieve documents in pages', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });

      const documents = await insertDocuments(TestTable, 10);

      let result = await TestTable.scan(null, {
        limit: 4,
      });

      assert.equal(result.entries.length, 4);
      assert.deepEqual(result.entries[0], documents[0]);
      assert.deepEqual(result.entries[1], documents[1]);
      assert.deepEqual(result.entries[2], documents[2]);
      assert.deepEqual(result.entries[3], documents[3]);

      result = await TestTable.scan(null, {
        continuation: result.continuation,
        limit: 4,
      });

      assert.equal(result.entries.length, 4);
      assert.deepEqual(result.entries[0], documents[4]);
      assert.deepEqual(result.entries[1], documents[5]);
      assert.deepEqual(result.entries[2], documents[6]);
      assert.deepEqual(result.entries[3], documents[7]);

      result = await TestTable.scan(null, {
        continuation: result.continuation,
        limit: 4,
      });

      assert.equal(result.entries.length, 2);
      assert.deepEqual(result.entries[0], documents[8]);
      assert.deepEqual(result.entries[1], documents[9]);
      assert(!result.continuation);
    });
  });
  suite('scan SQL injection checks', function() {
    const properties = {
      taskId: Entity.types.String,
      provisionerId: Entity.types.String,
      workerType: Entity.types.String,
      count: Entity.types.Number,
      expires: Entity.types.Date,
    };
    const configuredTestTable = Entity.configure({
      version: 1,
      partitionKey: Entity.keys.StringKey('taskId'),
      rowKey: Entity.keys.StringKey('provisionerId'),
      properties,
    });

    test('retrieve documents with string condition', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await assert.rejects(
        () => TestTable.scan({workerType: Entity.op.equal("foo")}),
        /can only be a date/);
    });

    test('retrieve documents with SQL escape in partition key', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      const document = {
        taskId: '1',
        provisionerId: 'test',
        workerType: 'test',
        count: 13,
        expies: new Date(),
      };
      await TestTable.create({ ...document, taskId: '1', expires: new Date('2020-01-01') });
      // Enabling EXPLAIN for this test shows (newlines added):
      // Query Text:
      //   select
      //     test_entities.partition_key,
      //     test_entities.row_key,
      //     test_entities.value,
      //     test_entities.version,
      //     test_entities.etag
      //   from test_entities
      //   where partition_key = ''' or 1=1; drop table test_entities; --'
      //   order by test_entities.partition_key, test_entities.row_key
      //   limit 1000 offset 0
      //
      // Which contains a correct quoting of the `'` character:
      //
      // postgres=# select ''' or 1=1; drop table test_entities; --';
      // ----------------------------------------
      //  ' or 1=1; drop table test_entities; --
      //
      // Furthermore, replacing the usage of `quote_literal` with a vulnerable equivalent results
      // in the following from this test, indicating a successful injection:
      //
      //   error: cannot open multi-query plan as cursor
      //   WHERE: PL/pgSQL function test_entities_scan(text,text,text,integer,integer) line 31 at RETURN QUERY
      //   CODE: 42P11
      const res = await TestTable.scan({taskId: "' or 1=1; drop table test_entities; --"});
      assert.deepEqual(res.entries, []);
    });

    test('retrieve documents with SQL escape in row key', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      const document = {
        taskId: '1',
        provisionerId: 'test',
        workerType: 'test',
        count: 13,
        expies: new Date(),
      };
      await TestTable.create({ ...document, taskId: '1', expires: new Date('2020-01-01') });
      const res = await TestTable.scan({provisionerId: "' or 1=1; drop table test_entities; --"});
      assert.deepEqual(res.entries, []);
    });

    test('retrieve documents with bare string condition', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await assert.rejects(
        () => TestTable.scan({workerType: "foo"}),
        /can only be a date/);
    });

    test('retrieve documents with numeric condition', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await assert.rejects(
        () => TestTable.scan({count: Entity.op.equal(10)}),
        /can only be a date/);
    });

    test('retrieve documents with numeric condition in comparison', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await assert.rejects(
        () => TestTable.scan({count: Entity.op.lessThan(10)}),
        /can only be a date/);
    });

    test('retrieve documents with string condition on datetime property', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName });
      await assert.rejects(
        () => TestTable.scan({expires: Entity.op.equal("foo")}),
        /can only be a date/);
    });
  });
});
