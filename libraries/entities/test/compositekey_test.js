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
    text1: Entity.types.String,
    text2: Entity.types.String,
    id: Entity.types.SlugId,
    data: Entity.types.Number,
  };
  const configuredTestTable = Entity.configure({
    version: 1,
    partitionKey: Entity.keys.CompositeKey('id', 'data'),
    rowKey: Entity.keys.CompositeKey('text1', 'text2'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('CompositeKey', function() {
    test('create & load', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const entry = {
        id,
        data: 42,
        text1: 'some text for the key',
        text2: 'another string for the key',
      };

      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      await TestTable.create(entry);

      const result = await TestTable.load({
        id,
        data: 42,
        text1: 'some text for the key',
        text2: 'another string for the key',
      });

      assert.equal(result._partitionKey, `${id}~42`);
      assert.equal(result._rowKey, `${entry.text1}~${entry.text2}`);
    });
  });
});
