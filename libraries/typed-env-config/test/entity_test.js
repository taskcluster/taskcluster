suite("entity", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../');

  // Load test configuration
  var cfg = base.config({
    envs: [
      'azureTestCredentials_accountName',
      'azureTestCredentials_accountKey',
      'azureTestCredentials_accountUrl',
      'azureTestTableName'
    ],
    filename:               'taskcluster-base-test'
  });

  // Check that we have configuration or abort
  if (!cfg.get('azureTestTableName') || !cfg.get('azureTestCredentials')) {
    console.log("\nWARNING:");
    console.log("Skipping 'enity' tests, missing config file: " +
                "taskcluster-base-test.conf.json");
    return;
  }

  // Configure an abstract Item to play with...
  var AbstractItem = base.Entity.configure({
    mapping: [
      {key: 'PartitionKey', property: 'pk',   type: 'string'},
      {key: 'RowKey',       property: 'rk',   type: 'string'},
      {key: 'str',          property: 'str',  type: 'string'},
      {key: 'nb',           property: 'nb',   type: 'number'},
      {key: 'js',           property: 'json', type: 'json'  },
      {key: 'id',           property: 'ID',   type: 'slugid'},
      {key: 'd',            property: 'date', type: 'date'  }
    ]
  });

  // Item configured with table name and credentials for testing
  var Item = AbstractItem.configure({
    credentials:  cfg.get('azureTestCredentials'),
    tableName:    cfg.get('azureTestTableName')
  });

  test("Item has class methods from Entity", function() {
    _.keys(base.Entity).forEach(function(k) {
      assert(Item[k] === base.Entity[k], "Item missing key: " + k);
    });
  });

  test("Item.createTable (ignore if exists)", function() {
    return Item.createTable();
  });

  // Test create
  test("Item.create", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "row-key",
      str:      "Hello World",
      nb:       1337.2,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === 'row-key',      "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      assert(item.nb    === 1337.2,         "nb mismatch");
      assert(item.json.Hello  === "World",  "json mismatch");
      assert(item.date  === date,           "Date mismatch");
    });
  });

  // Test instanceof
  test("item instanceof Item, AbstractItem, Entity", function() {
    return Item.create({
      pk:       slugid.v4(),
      rk:       "row-key",
      str:      "Hello World",
      nb:       1337.2,
      json:     {Hello: "World"},
      ID:       slugid.v4(),
      date:     new Date()
    }).then(function(item) {
      assert(item instanceof Item,          "item isn't instanceof Item");
      assert(item instanceof AbstractItem,  "item isn't instanceof AbstractItem");
      assert(item instanceof base.Entity,   "item isn't instanceof Entity");
    });
  });

  // Test load
  test("Item.load", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "row-key",
      str:      "Hello World",
      nb:       1337.2,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === 'row-key',      "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      assert(item.nb    === 1337.2,         "nb mismatch");
      assert(item.json.Hello  === "World",  "json mismatch");
      assert(item.date  === date,           "Date mismatch");
      return Item.load(id, 'row-key');
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === 'row-key',      "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      assert(item.nb    === 1337.2,         "nb mismatch");
      assert(item.json.Hello  === "World",  "json mismatch");
      assert(item.date instanceof Date,     "Date should be a date");
      assert(item.date.getTime() === date.getTime(), "Date mismatch");
    });
  });

  // Test load non-existing
  test("Item.load non-existing", function() {
    return Item.load(slugid.v4(), slugid.v4()).then(function() {
      assert(false, "We shouldn't be able to load this");
    }, function(err) {
      assert(err, "Error expected");
    });
  });

  // Test modify
  test("Item.modify", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "row-key",
      str:      "Hello World",
      nb:       1337.2,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      return item.modify(function() {
        this.nb = 42;
      });
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === 'row-key',      "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      assert(item.nb    === 42,             "nb mismatch");
      assert(item.json.Hello  === "World",  "json mismatch");
      assert(item.date instanceof Date,     "Date should be a date");
      assert(item.date.getTime() === date.getTime(), "Date mismatch");
      return Item.load(id, 'row-key');
    }).then(function(item) {
      assert(item.nb    === 42,             "nb mismatch");
    });
  });

  // Test modify concurrent with optimistic concurrency
  test("Item.modify concurrent", function() {
    var modified = 0;
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "row-key",
      str:      "Hello World",
      nb:       39,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      return Item.load(id, 'row-key').then(function(item2) {
        return Promise.all(
          item.modify(function() {
            modified += 1;
            this.nb = this.nb + 2;
          }),
          item2.modify(function() {
            modified += 1;
            this.nb = this.nb + 1;
          })
        );
      });
    }).then(function(item) {
      assert(modified > 2, "Modifier should have been applied more than twice");
      return Item.load(id, 'row-key');
    }).then(function(item) {
      assert(item.nb    === 42,             "nb mismatch");
    });
  });

  // Test item.remove
  test("item.remove", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "row-key",
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === 'row-key',      "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      assert(item.nb    === 34,             "nb mismatch");
      assert(item.json.Hello  === "World",  "json mismatch");
      assert(item.date instanceof Date,     "Date should be a date");
      assert(item.date.getTime() === date.getTime(), "Date mismatch");
      return item.remove();
    }).then(function() {
      return Item.load(id, "row-key").then(function() {
        assert(false, "We shouldn't be able to load this");
      }, function(err) {
        assert(err, "Error expected");
      });
    });
  });

  // Test Item.remove
  test("Item.remove", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "row-key",
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === 'row-key',      "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      return Item.remove(id, "row-key");
    }).then(function() {
      return Item.load(id, "row-key").then(function() {
        assert(false, "We shouldn't be able to load this");
      }, function(err) {
        assert(err, "Error expected");
      });
    });
  });

  // Test Item.queryPartitionKey
  test("Item.queryPartitionKey", function() {
    var date  = new Date();
    var id    = slugid.v4();
    var created_one = Item.create({
      pk:       id,
      rk:       "row-key1",
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    });
    var created_two = Item.create({
      pk:       id,
      rk:       "row-key2",
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    });
    return Promise.all(created_one, created_two).then(function() {
      return Item.queryPartitionKey(id);
    }).then(function(items) {
      assert(items.length == 2, "Expected two items");
      assert(items[0].pk    === id,             "pk mismatch");
      assert(items[0].str   === 'Hello World',  "str mismatch");
      assert(items[1].pk    === id,             "pk mismatch");
      assert(items[1].str   === 'Hello World',  "str mismatch");
      assert(items[0].rk    !== items[1].rk,    "rk mismatch");
    });
  });

  // Test Item.queryRowKey
  test("Item.queryRowKey", function() {
    var date  = new Date();
    var id    = slugid.v4();
    var created_one = Item.create({
      pk:       slugid.v4(),
      rk:       id,
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    });
    var created_two = Item.create({
      pk:       slugid.v4(),
      rk:       id,
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    });
    return Promise.all(created_one, created_two).then(function() {
      return Item.queryRowKey(id);
    }).then(function(items) {
      assert(items.length == 2, "Expected two items");
      assert(items[0].rk    === id,             "rk mismatch");
      assert(items[0].str   === 'Hello World',  "str mismatch");
      assert(items[1].rk    === id,             "rk mismatch");
      assert(items[1].str   === 'Hello World',  "str mismatch");
    });
  });
});

