suite("Entity (modify)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var debug   = require('debug')('base:test:entity:create_load');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var Item = base.Entity.configure({
    version:          1,
    partitionKey:     base.Entity.keys.StringKey('id'),
    rowKey:           base.Entity.keys.StringKey('name'),
    properties: {
      id:             base.Entity.types.String,
      name:           base.Entity.types.String,
      count:          base.Entity.types.Number
    }
  }).setup({
    credentials:  cfg.get('azure'),
    table:        cfg.get('azureTestTableName')
  });


  test("Item.create, Item.modify, Item.load", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function(item) {
      assert(item instanceof Item);
      assert(item.id === id);
      assert(item.count === 1);
      return item.modify(function() {
        this.count += 1;
      });
    }).then(function(item) {
      assert(item instanceof Item);
      assert(item.id === id);
      assert(item.count === 2);
      return Item.load({
        id:     id,
        name:   'my-test-item',
      });
    }).then(function(item) {
      assert(item instanceof Item);
      assert(item.id === id);
      assert(item.count === 2);
    });
  });

  test("Item.modify (concurrent)", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item',
      }).then(function(itemB) {
        return Promise.all([
          itemA.modify(function() {
            this.count += 1;
          }),
          itemB.modify(function() {
            this.count += 1;
          })
        ]);
      });
    }).then(function() {
      return Item.load({
        id:     id,
        name:   'my-test-item',
      });
    }).then(function(item) {
      assert(item instanceof Item);
      assert(item.id === id);
      assert(item.count === 3);
    });
  });

  test("Item.modify (concurrent 5)", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function() {
      var promisedItems = [];
      for(var i = 0; i < 5; i++) {
        promisedItems.push(Item.load({
          id:     id,
          name:   'my-test-item',
        }));
      }
      return Promise.all(promisedItems);
    }).then(function(items) {
      return Promise.all(items.map(function(item) {
        return item.modify(function() {
          this.count += 1;
        });
      }));
    }).then(function() {
      return Item.load({
        id:     id,
        name:   'my-test-item',
      });
    }).then(function(item) {
      assert(item instanceof Item);
      assert(item.id === id);
      assert(item.count === 6);
    });
  });
});
