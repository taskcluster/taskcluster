suite("entity", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../');
  var debug   = require('debug')('base:test:entity');

  // Load test configuration
  var cfg = base.config({
    envs: [
      'azure_accountName',
      'azure_accountKey',
      'azureTestTableName',
      'influxdb_connectionString'
    ],
    filename:               'taskcluster-base-test'
  });

  // Check that we have configuration or abort
  if (!cfg.get('azureTestTableName') ||
      !cfg.get('azure') ||
      !cfg.get('influxdb:connectionString')) {
    console.log("\nWARNING:");
    console.log("Skipping 'entity' tests, missing config file: " +
                "taskcluster-base-test.conf.json");
    return;
  }

  // Configure an abstract Item to play with...
  var AbstractItem = base.Entity.configure({
    mapping: [
      {key: 'PartitionKey', property: 'pk',   type: 'string'},
      {key: 'RowKey',       property: 'rk',   type: 'encodedstring'},
      {key: 'str',          property: 'str',  type: 'string'},
      {key: 'nb',           property: 'nb',   type: 'number'},
      {key: 'js',           property: 'json', type: 'json'  },
      {key: 'id',           property: 'ID',   type: 'slugid'},
      {key: 'd',            property: 'date', type: 'date'  }
    ]
  });

  // Item configured with table name and credentials for testing
  var Item = AbstractItem.configure({
    credentials:  cfg.get('azure'),
    tableName:    cfg.get('azureTestTableName')
  });

  // Configure an abstract Item with keystring to play with...
  var AbstractKeyStringItem = base.Entity.configure({
    mapping: [
      {key: 'PartitionKey', property: 'pk',   type: 'keystring'},
      {key: 'RowKey',       property: 'rk',   type: 'keystring'},
      {key: 'str',          property: 'str',  type: 'string'},
      {key: 'nb',           property: 'nb',   type: 'number'},
      {key: 'js',           property: 'json', type: 'json'  },
      {key: 'id',           property: 'ID',   type: 'slugid'},
      {key: 'd',            property: 'date', type: 'date'  }
    ]
  });

  // KeyStringItem configured with table name and credentials for testing
  var KeyStringItem = AbstractKeyStringItem.configure({
    credentials:  cfg.get('azure'),
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

  // Test create with special characters
  test("Item.create w. special characters", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "$@row/$key__",
      str:      "Hello World",
      nb:       1337.2,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === "$@row/$key__", "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      assert(item.nb    === 1337.2,         "nb mismatch");
      assert(item.json.Hello  === "World",  "json mismatch");
      assert(item.date  === date,           "Date mismatch");
    });
  });


  // Test create overwrite fails
  test("Item.create (overwrite fails)", function() {
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
      return Item.create({
        pk:       id,
        rk:       "row-key",
        str:      "Hello World",
        nb:       1337.2,
        json:     {Hello: "World"},
        ID:       id,
        date:     date
      }).then(function() {
        assert(false, "This should have failed");
      }, function(err) {
        assert(err.code === 'EntityAlreadyExists',
               "Expected an 'EntityAlreadyExists' error");
        debug("Got an expected error: %j", err);
      });
    });
  });

  // Test create with empty partition key
  test("Item.create (empty partition key)", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       "",
      rk:       id,
      str:      "Hello World",
      nb:       1337.2,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      assert(item.pk    === "",             "pk mismatch");
      assert(item.rk    === id,             "row-key mismatch");
      assert(item.str   === 'Hello World',  "str mismatch");
      assert(item.nb    === 1337.2,         "nb mismatch");
      assert(item.json.Hello  === "World",  "json mismatch");
      assert(item.date  === date,           "Date mismatch");
    });
  });

  // Test create with empty partition key
  test("Item.create (empty rowkey key)", function() {
    var date  = new Date();
    var id    = slugid.v4();
    return Item.create({
      pk:       id,
      rk:       "",
      str:      "Hello World",
      nb:       1337.2,
      json:     {Hello: "World"},
      ID:       id,
      date:     date
    }).then(function(item) {
      assert(item.pk    === id,             "pk mismatch");
      assert(item.rk    === "",             "row-key mismatch");
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
      debug("Expected error: %j", err);
      assert(err, "Error expected");
      assert(err.code == 'ResourceNotFound', "Expect code: ResourceNotFound");
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



  /*
  // Test Item.queryPartitionKey
  test("Item.queryPartitionKey, Item.iteratePartitionKey", function() {
    this.timeout(60 * 1000);
    var date  = new Date();
    var id    = slugid.v4();
    var createItem = function(number) {
      return Item.create({
        pk:       id,
        rk:       "number-" + number,
        str:      "Hello World",
        nb:       number,
        json:     {Hello: "World"},
        ID:       id,
        date:     date
      });
    };
    var itemsCreated = [];
    for(var i = 0; i < 1200; i++) {
      itemsCreated.push(createItem(i));
    }
    return Promise.all(itemsCreated).then(function() {
      return Item.queryPartitionKey(id);
    }).then(function(items) {
      assert(items.length == 1200, "Expected 1200 items");
      assert(items[0].pk    === id,             "pk mismatch");
      assert(items[0].str   === 'Hello World',  "str mismatch");
      assert(items[1].pk    === id,             "pk mismatch");
      assert(items[1].str   === 'Hello World',  "str mismatch");
      assert(items[0].rk    !== items[1].rk,    "rk mismatch");
    }).then(function() {
      return Item.iteratePartitionKey(id);
    }).then(function(result) {
      var items             = result[0];
      var continuationToken = result[1];
      assert(continuationToken, "Expected a continuationToken");
      assert(items.length > 2, "Expected more than two items");
      assert(items[0].pk    === id,             "pk mismatch");
      assert(items[0].str   === 'Hello World',  "str mismatch");
      assert(items[1].pk    === id,             "pk mismatch");
      assert(items[1].str   === 'Hello World',  "str mismatch");
      assert(items[0].rk    !== items[1].rk,    "rk mismatch");
      return Item.iteratePartitionKey(
        id,
        continuationToken
      ).then(function(result) {
        var items2             = result[0];
        var continuationToken2 = result[1];
        assert(!continuationToken2, "Didn't expected a continuationToken");
        items2.forEach(function(item2) {
          items.forEach(function(item) {
            assert(item2.rk !== item.rk, "RowKeys should be different");
          });
        });
      });
    });
  });
  */

  // Test Item.queryPartitionKey
  test("Item.queryPartitionKey", function() {
    this.timeout(60 * 1000);
    var date  = new Date();
    var id    = slugid.v4();
    var createItem = function(number) {
      return Item.create({
        pk:       id,
        rk:       "number-" + number,
        str:      "Hello World",
        nb:       number,
        json:     {Hello: "World"},
        ID:       id,
        date:     date
      });
    };
    var itemsCreated = [];
    for(var i = 0; i < 5; i++) {
      itemsCreated.push(createItem(i));
    }
    return Promise.all(itemsCreated).then(function() {
      return Item.queryPartitionKey(id);
    }).then(function(items) {
      assert(items.length == 5, "Expected 5 items");
      assert(items[0].pk    === id,             "pk mismatch");
      assert(items[0].str   === 'Hello World',  "str mismatch");
      assert(items[1].pk    === id,             "pk mismatch");
      assert(items[1].str   === 'Hello World',  "str mismatch");
      assert(items[0].rk    !== items[1].rk,    "rk mismatch");
    });
  });


  // Test KeyStringItem.iteratePartitionKey with empty partition key
  test("KeyStringItem.iteratePartitionKey (empty PartitionKey)", function() {
    this.timeout(60 * 1000);
    var date  = new Date();
    var id    = slugid.v4();
    var createItem = function(number) {
      return KeyStringItem.create({
        pk:       "",
        rk:       id + '-' + number,
        str:      "Hello World",
        nb:       number,
        json:     {Hello: "World"},
        ID:       id,
        date:     date
      });
    };
    var itemsCreated = [];
    for(var i = 0; i < 3; i++) {
      itemsCreated.push(createItem(i));
    }
    return Promise.all(itemsCreated).then(function() {
      return KeyStringItem.iteratePartitionKey("");
    }).then(function(result) {
      assert(result[0].length >= 3, "Expected at least 3 items");
    });
  });

  // Test Item.iteratePartitionKey
  test("Item.iteratePartitionKey", function() {
    this.timeout(60 * 1000);
    var date  = new Date();
    var id    = slugid.v4();
    var createItem = function(number) {
      return Item.create({
        pk:       id,
        rk:       "number-" + number,
        str:      "Hello World",
        nb:       number,
        json:     {Hello: "World"},
        ID:       id,
        date:     date
      });
    };
    var itemsCreated = [];
    for(var i = 0; i < 5; i++) {
      itemsCreated.push(createItem(i));
    }
    return Promise.all(itemsCreated).then(function() {
      return Item.iteratePartitionKey(id);
    }).then(function(result) {
      var items             = result[0];
      var continuationToken = result[1];
      assert(continuationToken === undefined, "Unexpected continuationToken");
      assert(items.length == 5, "Expected 5 items");
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

  // Test Item.queryProperty
  test("Item.queryProperty (without handler)", function() {
    this.timeout(60 * 1000);
    var date  = new Date();
    var id    = slugid.v4();
    var id2   = slugid.v4();
    var created = Item.create({
      pk:       slugid.v4(),
      rk:       id,
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id2,
      date:     date
    });
    return created.then(function() {
      return Item.queryProperty('ID', '==', id2);
    }).then(function(items) {
      assert(items.length == 1,                 "Expected one item");
      assert(items[0].rk    === id,             "rk mismatch");
      assert(items[0].str   === 'Hello World',  "str mismatch");
    });
  });

  // Test Item.queryProperty with handler
  test("Item.queryProperty (with handler)", function() {
    this.timeout(60 * 1000);
    var date  = new Date();
    var id    = slugid.v4();
    var id2   = slugid.v4();
    var gotit = false;
    var created = Item.create({
      pk:       slugid.v4(),
      rk:       id,
      str:      "Hello World",
      nb:       34,
      json:     {Hello: "World"},
      ID:       id2,
      date:     date
    });
    return created.then(function() {
      return Item.queryProperty('ID', '==', id2, function(item) {
        assert(item,                          "Expected an item");
        assert(item.rk    === id,             "rk mismatch");
        assert(item.str   === 'Hello World',  "str mismatch");
        gotit = true;
      });
    }).then(function() {
      assert(gotit, "Didn't get the item");
    });
  });

});

