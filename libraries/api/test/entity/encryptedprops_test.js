suite("Entity (encrypted properties)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var debug   = require('debug')('base:test:entity:encryptedProps');
  var crypto  = require('crypto');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  // Generate key for test
  var ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

  var ItemV1;
  test("ItemV1 = Entity.configure", function() {
    ItemV1 = base.Entity.configure({
      version:          1,
      partitionKey:     base.Entity.keys.StringKey('id'),
      rowKey:           base.Entity.keys.ConstantKey('enc-props-test'),
      properties: {
        id:             base.Entity.types.String,
        count:          base.Entity.types.EncryptedJSON
      }
    });
  });

  var Item;
  test("Item = ItemV1.setup", function() {
    Item = ItemV1.setup({
      credentials:      cfg.get('azure'),
      table:            cfg.get('azureTestTableName'),
      cryptoKey:        ENCRYPTION_KEY
    });
  });

  test("ItemV1.setup (requires cryptoKey)", function() {
    try {
      ItemV1.setup({
        credentials:  cfg.get('azure'),
        table:        cfg.get('azureTestTableName')
      });
    } catch (err) {
      return; // Expected error
    }
    assert(false, "Expected an error!");
  });

  test("ItemV1.setup (cryptoKey < 32 bytes doesn't work)", function() {
    try {
      ItemV1.setup({
        credentials:  cfg.get('azure'),
        table:        cfg.get('azureTestTableName'),
        cryptoKey:    crypto.randomBytes(31).toString('base64')
      });
    } catch (err) {
      return; // Expected error
    }
    assert(false, "Expected an error!");
  });

  test("ItemV1.setup (cryptoKey > 32 bytes doesn't work)", function() {
    try {
      ItemV1.setup({
        credentials:  cfg.get('azure'),
        table:        cfg.get('azureTestTableName'),
        cryptoKey:    crypto.randomBytes(33).toString('base64')
      });
    } catch (err) {
      return; // Expected error
    }
    assert(false, "Expected an error!");
  });

  test("ItemV1.setup (requires cryptoKey in base64)", function() {
    try {
      ItemV1.setup({
        credentials:  cfg.get('azure'),
        table:        cfg.get('azureTestTableName'),  // Notice: ! below
        cryptoKey:    'CNcj2aOozdo7Pn+HEkAIixwninIwKnbYc6JPS9mNxZ!='
      });
    } catch (err) {
      return; // Expected error
    }
    assert(false, "Expected an error!");
  });

  var id = slugid.v4();

  test("Item.create", function() {
    return Item.create({
      id:     id,
      count:  1
    });
  });

  test("Item.load, item.modify, item.reload()", function() {
    return Item.load({
      id:     id
    }).then(function(item) {
      assert(item.count === 1);
      return item.modify(function(item) {
        item.count += 1;
      });
    }).then(function(item) {
      assert(item.count === 2);
      return Item.load({
        id:     id
      });
    }).then(function(item) {
      assert(item.count === 2);
      return item.reload().then(function() {
        assert(item.count === 2);
      });
    });
  });

  test("Item.load (missing)", function() {
    return Item.load({
      id:     slugid.v4()
    }).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      assert(err.code === 'ResourceNotFound');
    });
  });

  test("Item.load (invalid cryptoKey)", function() {
    var BadKeyItem = ItemV1.setup({
      credentials:    cfg.get('azure'),
      table:          cfg.get('azureTestTableName'),
      cryptoKey:      crypto.randomBytes(32).toString('base64')
    });
    return BadKeyItem.load({
      id:     id
    }).then(function() {
      assert(false, "Expected a decryption error");
    }, function(err) {
      assert(err, "Expected a decryption error");
    });
  });

  var ItemV2;
  test("ItemV2 = ItemV1.configure (no encryption)", function() {
    ItemV2 = ItemV1.configure({
      version:          2,
      properties: {
        id:             base.Entity.types.String,
        count:          base.Entity.types.Number,
        reason:         base.Entity.types.String
      },
      migrate: function(item) {
        return {
          id:           item.id,
          count:        item.count,
          reason:       'no-reason'
        };
      }
    });
  });

  var Item2;
  test("Item2 = ItemV2.setup", function() {
    Item2 = ItemV2.setup({
      credentials:    cfg.get('azure'),
      table:          cfg.get('azureTestTableName'),
      cryptoKey:      ENCRYPTION_KEY
    });
  });

  test("ItemV2.setup (requires cryptoKey)", function() {
    try {
      ItemV2.setup({
        credentials:  cfg.get('azure'),
        table:        cfg.get('azureTestTableName')
      });
    } catch (err) {
      return; // Expected error
    }
    assert(false, "Expected an error!");
  });

  test("Item2.load (w. migrate)", function() {
    return Item2.load({
      id:     id
    }).then(function(item) {
      assert(item.count === 2);
      assert(item.reason === "no-reason");
    });
  });

  test("Item2.load (invalid cryptoKey)", function() {
    var BadKeyItem2 = ItemV2.setup({
      credentials:    cfg.get('azure'),
      table:          cfg.get('azureTestTableName'),
      cryptoKey:      crypto.randomBytes(32).toString('base64')
    });
    return BadKeyItem2.load({
      id:     id
    }).then(function() {
      assert(false, "Expected a decryption error");
    }, function(err) {
      assert(err, "Expected a decryption error");
    });
  });

  test("Item2.load, item.modify, item.reload()", function() {
    return Item2.load({
      id:     id
    }).then(function(item) {
      assert(item.count === 2);
      assert(item.reason === 'no-reason');
      return item.modify(function(item) {
        item.count += 1;
        item.reason = 'some-reason';
      });
    }).then(function(item) {
      assert(item.count === 3);
      assert(item.reason === 'some-reason');
      return item.reload().then(function() {
        assert(item.count === 3);
        assert(item.reason === 'some-reason');
      });
    }).then(function() {
      return Item2.load({
        id:     id
      });
    }).then(function(item) {
      assert(item.count === 3);
      assert(item.reason === 'some-reason');
      return item.reload().then(function() {
        assert(item.count === 3);
        assert(item.reason === 'some-reason');
      });
    });
  });

  var ItemV3;
  test("ItemV3 = ItemV2.configure", function() {
    ItemV3 = ItemV2.configure({
      version:          3,
      properties: {
        id:             base.Entity.types.String,
        count:          base.Entity.types.EncryptedJSON
      },
      migrate: function(item) {
        return {
          id:           item.id,
          count:        item.count
        };
      }
    });
  });

  var Item3;
  test("Item3 = ItemV3.setup", function() {
    Item3 = ItemV3.setup({
      credentials:    cfg.get('azure'),
      table:          cfg.get('azureTestTableName'),
      cryptoKey:      ENCRYPTION_KEY
    });
  });

  test("Item3.load, item.modify, item.reload()", function() {
    return Item3.load({
      id:     id
    }).then(function(item) {
      assert(item.count === 3);
      assert(item.reason === undefined);
      return item.modify(function(item) {
        item.count += 1;
      });
    }).then(function(item) {
      assert(item.count === 4);
      return item.reload().then(function() {
        assert(item.count === 4);
      });
    }).then(function() {
      return Item3.load({
        id:     id
      });
    }).then(function(item) {
      assert(item.count === 4);
      return item.reload().then(function() {
        assert(item.count === 4);
      });
    });
  });

  test("Item3.load (invalid cryptoKey)", function() {
    var BadKeyItem3 = ItemV3.setup({
      credentials:    cfg.get('azure'),
      table:          cfg.get('azureTestTableName'),
      cryptoKey:      crypto.randomBytes(32).toString('base64')
    });
    return BadKeyItem3.load({
      id:     id
    }).then(function() {
      assert(false, "Expected a decryption error");
    }, function(err) {
      assert(err, "Expected a decryption error");
    });
  });
});
