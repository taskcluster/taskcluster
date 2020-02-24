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
    text1: Entity.types.Text,
    text2: Entity.types.String,
    id: Entity.types.SlugId,
    data: Entity.types.JSON,
  };
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.HashKey('id', 'data'),
    rowKey: Entity.keys.HashKey('text1', 'text2'),
    properties,
  });
  const serviceName = 'test-entities';

  suite('HashKey', function() {
    test('TestTable.create, HashKey.exact (test against static data)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const id = slugid.v4();
      const item = await TestTable.create({
        id: id,
        data: {my: 'object', payload: 42},
        text1: 'some text for the key',
        text2: 'another string for the key',
      });

      const hash = item.constructor.__rowKey.exact(item._properties);
      assert(hash === '8cdcd277cf2ddcb7be572019ef154756' +
                    '86484a3c3eeb4fe3caa5727f0aadd7c9' +
                    '8b873a64a7c54336a3f973e1902d4f1f' +
                    '1dbe7a067943b12b3948a96b4a3acc19');
    });

    test('TestTable.create, TestTable.load', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const id = slugid.v4();
      await TestTable.create({
        id: id,
        data: {my: 'object', payload: 42},
        text1: 'some text for the key',
        text2: 'another string for the key',
      });

      const loaded = await TestTable.load({
        id: id,
        data: {payload: 42, my: 'object'},
        text1: 'some text for the key',
        text2: 'another string for the key',
      });

      assert.equal(loaded.text1, "some text for the key");
    });

    test('Can\'t modify key', async function() {
      db = await helper.withDb({ schema, serviceName });
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
      });
      const id = slugid.v4();
      const item = await TestTable.create({
        id: id,
        data: {my: 'object', payload: 42},
        text1: 'some text for the key',
        text2: 'another string for the key',
      });

      await assert.rejects(async () => {
        return item.modify(function() {
          this.text1 = 'This will never work';
        });
      }, /can't modify element/);
    });
  });
});
