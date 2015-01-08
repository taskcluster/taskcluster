suite("Entity (CompositeKey)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var crypto  = require('crypto');
  var debug   = require('debug')('base:test:entity:compositekey');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var Item = base.Entity.configure({
    version:          1,
    partitionKey:     base.Entity.keys.CompositeKey('id', 'data'),
    rowKey:           base.Entity.keys.CompositeKey('text1', 'text2'),
    properties: {
      text1:          base.Entity.types.String,
      text2:          base.Entity.types.String,
      id:             base.Entity.types.SlugId,
      data:           base.Entity.types.Number
    }
  }).setup({
    credentials:  cfg.get('azure'),
    table:        cfg.get('azureTestTableName')
  });

  test("Item.create, Item.load", function() {
    var id = slugid.v4();
    return Item.create({
      id:       id,
      data:     42,
      text1:    "some text for the key",
      text2:    "another string for the key"
    }).then(function() {
      return Item.load({
        id:       id,
        data:     42,
        text1:    "some text for the key",
        text2:    "another string for the key"
      });
    });
  });

  test("Can't modify key", function() {
    var id = slugid.v4();
    return Item.create({
      id:       id,
      data:     42,
      text1:    "some text for the key",
      text2:    "another string for the key"
    }).then(function(item) {
      return item.modify(function() {
        this.text1 = "This will never work";
      }).then(function() {
        assert(false, "Expected an error!");
      }, function(err) {
        debug("Catched Expected error")
        assert(err);
      });
    });
  });

  test("Using an empty strings", function() {
    var id = slugid.v4();
    return Item.create({
      id:       id,
      data:     42,
      text1:    "",
      text2:    "another string for the key"
    }).then(function() {
      return Item.load({
        id:       id,
        data:     42,
        text1:    "",
        text2:    "another string for the key"
      });
    });
  });
});
