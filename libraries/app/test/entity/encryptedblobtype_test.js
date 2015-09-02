suite("Entity (EncryptedBlobType)", function() {
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
      data:           base.Entity.types.EncryptedBlob
    }
  }).setup({
    credentials:      cfg.get('azure'),
    table:            cfg.get('azureTestTableName'),
    cryptoKey:        'CNcj2aOozdo7Pn+HEkAIixwninIwKnbYc6JPS9mNxZk='
  });

  var compareBuffers = function(b1, b2) {
    assert(Buffer.isBuffer(b1));
    assert(Buffer.isBuffer(b2));
    if (b1.length !== b2.length) {
      return false;
    }
    var n = b1.length;
    for (var i = 0; i < n; i++) {
      if (b1[i] !== b2[i]) {
        return false;
      }
    }
    return true;
  }

  test("small blob", function() {
    var id  = slugid.v4();
    var buf = new Buffer([0, 1, 2, 3]);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   buf
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(compareBuffers(itemA.data, itemB.data));
      });
    });
  });

  test("large blob (64k)", function() {
    var id  = slugid.v4();
    var buf = crypto.pseudoRandomBytes(64 * 1024);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   buf
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(compareBuffers(itemA.data, itemB.data));
      });
    });
  });

  test("large blob (128k)", function() {
    var id  = slugid.v4();
    var buf = crypto.pseudoRandomBytes(128 * 1024);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   buf
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(compareBuffers(itemA.data, itemB.data));
      });
    });
  });

  test("large blob (256k - 32)", function() {
    var id  = slugid.v4();
    var buf = crypto.pseudoRandomBytes(256 * 1024 - 32);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   buf
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(compareBuffers(itemA.data, itemB.data));
      });
    });
  });
});
