suite("Entity (EncryptedTextType)", function() {
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
      data:           base.Entity.types.EncryptedText
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

  test("small text", function() {
    var id    = slugid.v4();
    var text  = "Hello World";
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   text
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data === itemB.data);
        assert(text === itemB.data);
      });
    });
  });

  test("large text (64k)", function() {
    var id    = slugid.v4();
    var text  = randomString(64);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   text
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data === itemB.data);
        assert(text === itemB.data);
      });
    });
  });

  test("large text (128k)", function() {
    var id    = slugid.v4();
    var text  = randomString(128);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   text
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data === itemB.data);
        assert(text === itemB.data);
      });
    });
  });

  test("large text (256k - 32)", function() {
    var id    = slugid.v4();
    var text  = randomString(256);
    // Remove 16 to make room for iv
    text = text.substr(0, text.length - 32);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   text
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data === itemB.data);
        assert(text === itemB.data);
      });
    });
  });
});
