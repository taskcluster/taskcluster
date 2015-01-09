suite("Entity (create/load)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var debug   = require('debug')('base:test:entity:create_load');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var ItemV1;
  test("ItemV1 = Entity.configure", function() {
    ItemV1 = base.Entity.configure({
      version:          1,
      partitionKey:     base.Entity.keys.StringKey('id'),
      rowKey:           base.Entity.keys.StringKey('name'),
      properties: {
        id:             base.Entity.types.String,
        name:           base.Entity.types.String,
        count:          base.Entity.types.Number
      }
    });
  });

  var Item;
  test("Item = ItemV1.setup", function() {
    Item = ItemV1.setup({
      credentials:  cfg.get('azure'),
      table:        cfg.get('azureTestTableName')
    });
  });

  test("Item.ensureTable", function() {
    return Item.ensureTable();
  });

  var id = slugid.v4();

  test("Item.create", function() {
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    });
  });

  test("Item.load", function() {
    return Item.load({
      id:     id,
      name:   'my-test-item',
    }).then(function(item) {
      assert(item.count === 1);
    });
  });

  test("ItemV2 = ItemV1.configure", function() {
    ItemV2 = ItemV1.configure({
      version:          2,
      properties: {
        id:             base.Entity.types.String,
        name:           base.Entity.types.String,
        count:          base.Entity.types.Number,
        reason:         base.Entity.types.String
      },
      migrate: function(item) {
        return {
          id:           item.id,
          name:         item.name,
          count:        item.count,
          reason:       "no-reason"
        };
      }
    });
  });

  test("Item = ItemV2.setup", function() {
    Item = ItemV2.setup({
      credentials:  cfg.get('azure'),
      table:        cfg.get('azureTestTableName')
    });
  });


  test("Item.load", function() {
    return Item.load({
      id:     id,
      name:   'my-test-item',
    }).then(function(item) {
      assert(item.count === 1);
      assert(item.reason === "no-reason");
    });
  });
});
