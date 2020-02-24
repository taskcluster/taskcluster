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
    id: Entity.types.SlugId,
    rev: Entity.types.PositiveInteger,
    text: Entity.types.String,
  };
  const configuredTestTable = Entity.configure({
    version: 1,
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.AscendingIntegerKey('rev'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('AscendingIntegerKey', function() {
    test('create & load', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const text = slugid.v4();
      const entry = {
        id,
        rev: 0,
        text,
      };

      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      await TestTable.create(entry);

      const result = await TestTable.load({ id, rev: 0 });

      assert.equal(result.text, text);
    });
    test('can\'t modify key', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const text = slugid.v4();
      const entry = {
        id,
        rev: 0,
        text,
      };

      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const createdEntity = await TestTable.create(entry);

      await assert.rejects(async () => {
        await createdEntity.modify(item => {
          item.rev = 1;
        });
      }, /can't modify element/);
    });
    test('can\'t use negative numbers', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const text = slugid.v4();
      const entry = {
        id,
        rev: -1,
        text,
      };

      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });

      await assert.rejects(async () => {
        await TestTable.create(entry);
      }, /expected a positive integer/);
    });
    test('preserve ordering listing a partition', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();

      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      await TestTable.create({ id, rev: 1, text: 'B' });
      await TestTable.create({ id, rev: 14, text: 'D' });
      await TestTable.create({ id, rev: 0, text: 'A' });
      await TestTable.create({ id, rev: 2, text: 'C' });
      await TestTable.create({ id, rev: 200, text: 'E' });

      const result = await TestTable.query({ id });
      const revs = result.entries.map(item => item.rev);
      assert.deepEqual(revs, [0, 1, 2, 14, 200], 'wrong revision order');
      assert.deepEqual(result.entries.map(item => item.text), [
        'A', 'B', 'C', 'D', 'E',
      ], 'wrong order of text properties');
    });
  });
});
