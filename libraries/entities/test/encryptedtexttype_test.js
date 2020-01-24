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
    data: Entity.types.EncryptedText,
  };
  const configuredTestTable = Entity.configure({
    partitionKey: Entity.keys.StringKey('id'),
    rowKey: Entity.keys.StringKey('name'),
    properties,
  });
  const serviceName = 'test-entities';
  const cryptoKey = 'CNcj2aOozdo7Pn+HEkAIixwninIwKnbYc6JPS9mNxZk=';

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

  suite('EncryptedTextType', function() {
    test('largeString helper', async function() {
      const text = randomString(64);

      assert.equal(text.length, 1024 * 64);
    });

    test('small text', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const text = 'Hello World';
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        data: text,
      }).then(function(itemA) {
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        }).then(function(itemB) {
          assert(itemA.data === itemB.data);
          assert(text === itemB.data);
        });
      });
    });

    test('large text (64k)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const text = randomString(64);
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        data: text,
      }).then(function(itemA) {
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        }).then(function(itemB) {
          assert(itemA.data === itemB.data);
          assert(text === itemB.data);
        });
      });
    });

    test('large text (128k)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      const text = randomString(128);
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        data: text,
      }).then(function(itemA) {
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        }).then(function(itemB) {
          assert(itemA.data === itemB.data);
          assert(text === itemB.data);
        });
      });
    });

    test('large text (256k - 32)', async function() {
      db = await helper.withDb({ schema, serviceName });
      const id = slugid.v4();
      let text = randomString(256);
      const TestTable = configuredTestTable.setup({
        tableName: 'test_entities',
        db,
        serviceName,
        cryptoKey,
      });

      // Remove 16 to make room for iv
      text = text.substr(0, text.length - 32);

      return TestTable.create({
        id: id,
        name: 'my-test-item',
        data: text,
      }).then(function(itemA) {
        return TestTable.load({
          id: id,
          name: 'my-test-item',
        }).then(function(itemB) {
          assert(itemA.data === itemB.data);
          assert(text === itemB.data);
        });
      });
    });
  });
});
