suite("Entity (Common DataTypes)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var crypto  = require('crypto');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var testType = function(name, type, sample) {
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

      var id    = slugid.v4();
      return Item.create({
        id:     id,
        name:   'my-test-item',
        data:   sample
      }).then(function(itemA) {
        return Item.load({
          id:     id,
          name:   'my-test-item'
        }).then(function(itemB) {
          assert(_.isEqual(itemA.data, itemB.data));
          assert(_.isEqual(itemA.data, sample));
        });
      });
    });
  };

  testType(
    'Entity.types.String',
    base.Entity.types.String,
    "Hello World"
  );
  testType(
    'Entity.types.Number',
    base.Entity.types.Number,
    42.3
  );
  testType(
    'Entity.types.Date',
    base.Entity.types.Date,
    new Date()
  );
  testType(
    'Entity.types.UUID',
    base.Entity.types.UUID,
    'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  );
  testType(
    'Entity.types.SlugId',
    base.Entity.types.SlugId,
    'nvItOmAyRiOvSSWCAHkobQ'
  );
  testType(
    'Entity.types.JSON',
    base.Entity.types.JSON,
    {
      subobject: {number: 42},
      array: [1,2,3,4, "string"]
    }
  );
  // BlobType cannot be tested with is.Equal, we also have separate tests for
  // this EntityType.
  testType(
    'Entity.types.Text',
    base.Entity.types.Text,
    "Hello World\n could be a very long string"
  );
  // SlugIdArray cannot be tested with is.Equal, we also have separate tests for
  // this EntityType.
});
