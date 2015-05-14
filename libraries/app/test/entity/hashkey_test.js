suite("Entity (HashKey)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var crypto  = require('crypto');
  var debug   = require('debug')('base:test:entity:hashkey');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var Item = base.Entity.configure({
    version:          1,
    partitionKey:     base.Entity.keys.HashKey('id', 'data'),
    rowKey:           base.Entity.keys.HashKey('text1', 'text2'),
    properties: {
      text1:          base.Entity.types.Text,
      text2:          base.Entity.types.String,
      id:             base.Entity.types.SlugId,
      data:           base.Entity.types.JSON
    }
  }).setup({
    credentials:  cfg.get('azure'),
    table:        cfg.get('azureTestTableName')
  });

  test("Item.create, HashKey.exact (test against static data)", function() {
    var id = slugid.v4();
    return Item.create({
      id:       id,
      data:     {my: "object", payload: 42},
      text1:    "some text for the key",
      text2:    "another string for the key"
    }).then(function(item) {
      var hash = item.__rowKey.exact(item._properties);
      assert(hash === '8cdcd277cf2ddcb7be572019ef154756' +
                      '86484a3c3eeb4fe3caa5727f0aadd7c9' +
                      '8b873a64a7c54336a3f973e1902d4f1f' +
                      '1dbe7a067943b12b3948a96b4a3acc19');
    });
  });

  test("Item.create, Item.load", function() {
    var id = slugid.v4();
    return Item.create({
      id:       id,
      data:     {my: "object", payload: 42},
      text1:    "some text for the key",
      text2:    "another string for the key"
    }).then(function() {
      return Item.load({
        id:       id,
        data:     {payload: 42, my: "object"},
        text1:    "some text for the key",
        text2:    "another string for the key"
      });
    });
  });

  test("Can't modify key", function() {
    var id = slugid.v4();
    return Item.create({
      id:       id,
      data:     {my: "object", payload: 42},
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
});
