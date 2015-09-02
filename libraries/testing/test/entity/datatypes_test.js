suite("Entity (create/load/modify DataTypes)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var crypto  = require('crypto');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var testType = function(name, type, sample1, sample2, encryptedTestOnly) {
    assert(!_.isEqual(sample1, sample2), "Samples should not be equal!");
    if (!encryptedTestOnly) {
      test(name, function() {
        var Item = base.Entity.configure({
          version:          1,
          partitionKey:     base.Entity.keys.StringKey('id'),
          rowKey:           base.Entity.keys.StringKey('name'),
          properties: {
            id:             base.Entity.types.String,
            name:           base.Entity.types.String,
            data:           type
          }
        }).setup({
          credentials:  cfg.get('azure'),
          table:        cfg.get('azureTestTableName')
        });

        var id = slugid.v4();
        return Item.create({
          id:     id,
          name:   'my-test-item',
          data:   sample1
        }).then(function(itemA) {
          return Item.load({
            id:     id,
            name:   'my-test-item'
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, sample1));
            return itemB;
          });
        }).then(function(item) {
          return item.modify(function(item) {
            item.data = sample2;
          });
        }).then(function(itemA) {
          return Item.load({
            id:     id,
            name:   'my-test-item'
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, sample2));
          });
        });
      });

      test(name + ' (signEntities)', function() {
        var Item = base.Entity.configure({
          version:          1,
          partitionKey:     base.Entity.keys.StringKey('id'),
          rowKey:           base.Entity.keys.ConstantKey('signing-test-item'),
          signEntities:     true,
          properties: {
            id:             base.Entity.types.String,
            data:           type
          }
        }).setup({
          credentials:      cfg.get('azure'),
          table:            cfg.get('azureTestTableName'),
          signingKey:       'my-super-secret'
        });
        var id = slugid.v4();
        return Item.create({
          id:     id,
          data:   sample1
        }).then(function(itemA) {
          return Item.load({
            id:     id
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, sample1));
            return itemB;
          });
        }).then(function(item) {
          return item.modify(function(item) {
            item.data = sample2;
          });
        }).then(function(itemA) {
          return Item.load({
            id:     id
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, sample2));
          });
        });
      });

      test(name + ' (signEntities detect invalid key)', function() {
        var ItemClass = base.Entity.configure({
          version:          1,
          partitionKey:     base.Entity.keys.StringKey('id'),
          rowKey:           base.Entity.keys.ConstantKey('signing-test-item'),
          signEntities:     true,
          properties: {
            id:             base.Entity.types.String,
            data:           type
          }
        })
        var Item1 = ItemClass.setup({
          credentials:      cfg.get('azure'),
          table:            cfg.get('azureTestTableName'),
          signingKey:       'my-super-secret'
        });
        var Item2 = ItemClass.setup({
          credentials:      cfg.get('azure'),
          table:            cfg.get('azureTestTableName'),
          signingKey:       'my-super-wrong-secret'
        });
        var id = slugid.v4();
        return Item1.create({
          id:     id,
          data:   sample1
        }).then(function(itemA) {
          return Item2.load({id: id}).then(function() {
            assert(false, "Expected an error");
          }, function() {
            return Item1.load({id: id});
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, sample1));
            return itemB;
          });
        }).then(function(item) {
          return item.modify(function(item) {
            item.data = sample2;
          });
        }).then(function(itemA) {
          return Item1.load({
            id:     id
          }).then(function(itemB) {
            assert(_.isEqual(itemA.data, itemB.data));
            assert(_.isEqual(itemA.data, sample2));
          });
        }).then(function() {
          return Item2.load({id: id}).then(function() {
            assert(false, "Expected an error");
          }, function() {
            // Ignore expected error
          });
        });
      });
    }

    test(name + ' (w. EncryptedBlob)', function() {
      var Item = base.Entity.configure({
        version:          1,
        partitionKey:     base.Entity.keys.StringKey('id'),
        rowKey:           base.Entity.keys.ConstantKey('my-signing-test-item'),
        properties: {
          id:             base.Entity.types.String,
          blob:           base.Entity.types.EncryptedBlob,
          data:           type
        }
      }).setup({
        credentials:      cfg.get('azure'),
        table:            cfg.get('azureTestTableName'),
        cryptoKey:        'Iiit3Y+b4m7z7YOmKA2iCbZDGyEmy6Xn42QapzTU67w='
      });

      var id = slugid.v4();
      return Item.create({
        id:     id,
        blob:   new Buffer([1,2,3,4,5,6,7,8]),
        data:   sample1
      }).then(function(itemA) {
        return Item.load({
          id:     id
        }).then(function(itemB) {
          assert(_.isEqual(itemA.data, itemB.data));
          assert(_.isEqual(itemA.data, sample1));
          return itemB;
        });
      }).then(function(item) {
        return item.modify(function(item) {
          item.data = sample2;
        });
      }).then(function(itemA) {
        return Item.load({
          id:     id
        }).then(function(itemB) {
          assert(_.isEqual(itemA.data, itemB.data));
          assert(_.isEqual(itemA.data, sample2));
        });
      });
    });

    test(name + ' (w. EncryptedBlob + signEntities)', function() {
      var Item = base.Entity.configure({
        version:          1,
        partitionKey:     base.Entity.keys.StringKey('id'),
        rowKey:           base.Entity.keys.ConstantKey('my-signing-test-item'),
        signEntities:     true,
        properties: {
          id:             base.Entity.types.String,
          blob:           base.Entity.types.EncryptedBlob,
          data:           type
        }
      }).setup({
        credentials:      cfg.get('azure'),
        table:            cfg.get('azureTestTableName'),
        signingKey:       'my-super-secret',
        cryptoKey:        'Iiit3Y+b4m7z7YOmKA2iCbZDGyEmy6Xn42QapzTU67w='
      });

      var id = slugid.v4();
      return Item.create({
        id:     id,
        blob:   new Buffer([1,2,3,4,5,6,7,8]),
        data:   sample1
      }).then(function(itemA) {
        return Item.load({
          id:     id
        }).then(function(itemB) {
          assert(_.isEqual(itemA.data, itemB.data));
          assert(_.isEqual(itemA.data, sample1));
          return itemB;
        });
      }).then(function(item) {
        return item.modify(function(item) {
          item.data = sample2;
        });
      }).then(function(itemA) {
        return Item.load({
          id:     id
        }).then(function(itemB) {
          assert(_.isEqual(itemA.data, itemB.data));
          assert(_.isEqual(itemA.data, sample2));
        });
      });
    });
  };

  testType(
    'Entity.types.String',
    base.Entity.types.String,
    "Hello World",
    "Hello World Again"
  );
  testType(
    'Entity.types.Number',
    base.Entity.types.Number,
    42.3,
    56.7
  );
  testType(
    'Entity.types.Date',
    base.Entity.types.Date,
    new Date(),
    new Date('2015-09-01T03:47:24.883Z')
  );
  testType(
    'Entity.types.UUID',
    base.Entity.types.UUID,
    'f47ac10b-58cc-4372-a567-0e02b2c3d479', // v4 uuid
    '37175f00-505c-11e5-ad72-69c56eeb1d01'  // v1 uuid
  );
  testType(
    'Entity.types.SlugId',
    base.Entity.types.SlugId,
    'nvItOmAyRiOvSSWCAHkobQ',
    'NgmMmc_oQZ-dC4nPzWI1Ug'
  );
  testType(
    'Entity.types.JSON',
    base.Entity.types.JSON,
    {
      subobject: {number: 42},
      array: [1,2,3,4, "string"]
    }, {
      subobject: {number: 51},
      array: [1,2,3,4,5, "string"]
    }
  );
  testType(
    'Entity.types.Blob',
    base.Entity.types.Blob,
    crypto.randomBytes(10 * 1000),
    crypto.randomBytes(100 * 1000)
  );
  testType(
    'Entity.types.Text',
    base.Entity.types.Text,
    "Hello World\n could be a very long string",
    crypto.randomBytes(100 * 1000).toString('base64')
  );
  // SlugIdArray cannot be tested with _.isEqual, we also have separate tests for
  // this EntityType.
  testType(
    'Entity.types.EncryptedJSON',
    base.Entity.types.EncryptedJSON,
    {
      subobject: {number: 42},
      array: [1,2,3,4, "string"]
    }, {
      subobject: {number: 51},
      array: [1,2,3,4,5, "string"]
    },
    true
  );
  testType(
    'Entity.types.EncryptedText',
    base.Entity.types.EncryptedText,
    "Hello World\n could be a very long string",
    crypto.randomBytes(100 * 1000).toString('base64'),
    true
  );
  testType(
    'Entity.types.EncryptedBlob',
    base.Entity.types.EncryptedBlob,
    crypto.randomBytes(10 * 1000),
    crypto.randomBytes(100 * 1000),
    true
  );
});
