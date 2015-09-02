suite("Entity (EncryptedJSONType)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var crypto  = require('crypto');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var Item = base.Entity.configure({
    version:          1,
    partitionKey:     base.Entity.keys.StringKey('id'),
    rowKey:           base.Entity.keys.StringKey('name'),
    properties: {
      id:             base.Entity.types.String,
      name:           base.Entity.types.String,
      data:           base.Entity.types.EncryptedJSON
    }
  }).setup({
    credentials:      cfg.get('azure'),
    table:            cfg.get('azureTestTableName'),
    cryptoKey:        'CNcj2aOozdo7Pn+HEkAIixwninIwKnbYc6JPS9mNxZk='
  });

  // Construct a large string
  var randomString = function(kbytes) {
    var s = "abcefsfcccsrcsdfsdfsfrfdefdwedwiedowijdwoeidnwoifneoifnweodnwoid";
    s = s + s; // 128
    s = s + s; // 256
    s = s + s; // 512
    s = s + s; // 1024
    var arr = [];
    for(var i = 0; i < kbytes; i++) {
      arr.push(s);
    }
    return arr.join('');
  };

  test("largeString helper", function() {
    var text  = randomString(64);
    assert(text.length === 1024 * 64);
  });

  test("small JSON object", function() {
    var id    = slugid.v4();
    var obj   = {text: "Hello World", number: 42};
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   obj
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(_.isEqual(itemA.data, itemB.data));
        assert(_.isEqual(itemA.data, obj));
      });
    });
  });


  test("large JSON object (62k)", function() {
    var id    = slugid.v4();
    var obj   = {text: randomString(62), number: 42};
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   obj
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(_.isEqual(itemA.data, itemB.data));
        assert(_.isEqual(itemA.data, obj));
      });
    });
  });

  test("large JSON object (126k)", function() {
    var id    = slugid.v4();
    var obj   = {text: randomString(126), number: 42};
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   obj
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(_.isEqual(itemA.data, itemB.data));
        assert(_.isEqual(itemA.data, obj));
      });
    });
  });

  test("large JSON object (255k)", function() {
    var id    = slugid.v4();
    var obj   = {text: randomString(255), number: 42};
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   obj
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(_.isEqual(itemA.data, itemB.data));
        assert(_.isEqual(itemA.data, obj));
      });
    });
  });
});
