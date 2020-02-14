const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const path = require('path');
const assert = require('assert').strict;
const _ = require('lodash');
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
  const serviceName = 'test-entities';

  [
    {
      context: 'JSON',
      options: {
        type: Entity.types.JSON,
      },
    }, {
      context: 'EncryptedJSON',
      options: {
        type: Entity.types.EncryptedJSON,
        config: {
          cryptoKey: 'Iiit3Y+b4m7z7YOmKA2iCbZDGyEmy6Xn42QapzTU67w=',
        },
      },
    },
    {
      context: 'Schema',
      options: {
        type: Entity.types.Schema({type: 'object'}),
      },
    },
    {
      context: 'EncryptedSchema',
      options: {
        type: Entity.types.EncryptedSchema({type: 'object'}),
        config: {
          cryptoKey: 'Iiit3Y+b4m7z7YOmKA2iCbZDGyEmy6Xn42QapzTU67w=',
        },
      },
    },
  ].forEach(context => {
    suite(context.context, function() {
      const { type, config } = context.options;
      const configuredTestTable = Entity.configure({
        version: 1,
        partitionKey: Entity.keys.StringKey('id'),
        rowKey: Entity.keys.StringKey('name'),
        properties: {
          id: Entity.types.String,
          name: Entity.types.String,
          data: type,
        },
      });

      // Construct a large string
      const randomString = function(kbytes) {
        let s = 'abcefsfcccsrcsdfsdfsfrfdefdwedwiedowijdwoeidnwoifneoifnweodnwoid';
        s += s; // 128
        s += s; // 256
        s += s; // 512
        s += s; // 1024
        const arr = [];
        for (let i = 0; i < kbytes; i++) {
          arr.push(s);
        }
        return arr.join('');
      };

      test('largeString helper', function() {
        const text = randomString(64);
        assert(text.length === 1024 * 64);
      });

      test('small JSON object', async function() {
        db = await helper.withDb({ schema, serviceName });
        const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName, ...config });
        const id = slugid.v4();
        const obj = {text: 'Hello World', number: 42};
        return TestTable.create({
          id: id,
          name: 'my-test-item',
          data: obj,
        }).then(function(itemA) {
          return TestTable.load({
            id: id,
            name: 'my-test-item',
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, obj));
          });
        });
      });

      test('large JSON object (62k)', async function() {
        db = await helper.withDb({ schema, serviceName });
        const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName, ...config });
        const id = slugid.v4();
        const obj = {text: randomString(62), number: 42};
        return TestTable.create({
          id: id,
          name: 'my-test-item',
          data: obj,
        }).then(function(itemA) {
          return TestTable.load({
            id: id,
            name: 'my-test-item',
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, obj));
          });
        });
      });

      test('large JSON object (126k)', async function() {
        db = await helper.withDb({ schema, serviceName });
        const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName, ...config });
        const id = slugid.v4();
        const obj = {text: randomString(126), number: 42};
        return TestTable.create({
          id: id,
          name: 'my-test-item',
          data: obj,
        }).then(function(itemA) {
          return TestTable.load({
            id: id,
            name: 'my-test-item',
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, obj));
          });
        });
      });

      test('large JSON object (255k)', async function() {
        db = await helper.withDb({ schema, serviceName });
        const TestTable = configuredTestTable.setup({ tableName: 'test_entities', db, serviceName, ...config });
        const id = slugid.v4();
        const obj = {text: randomString(255), number: 42};
        return TestTable.create({
          id: id,
          name: 'my-test-item',
          data: obj,
        }).then(function(itemA) {
          return TestTable.load({
            id: id,
            name: 'my-test-item',
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, obj));
          });
        });
      });
    });
  });
});
