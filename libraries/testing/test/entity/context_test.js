suite("Entity (context)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var debug   = require('debug')('base:test:entity:context');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  test("Entity.configure().setup()", function() {
    base.Entity.configure({
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
  });

  test("Entity.configure().setup() with context", function() {
    base.Entity.configure({
      version:          1,
      partitionKey:     base.Entity.keys.StringKey('id'),
      rowKey:           base.Entity.keys.StringKey('name'),
      properties: {
        id:             base.Entity.types.String,
        name:           base.Entity.types.String,
        count:          base.Entity.types.Number
      },
      context:          ['config']
    }).setup({
      credentials:  cfg.get('azure'),
      table:        cfg.get('azureTestTableName'),
      context: {
        config:     "My config object"
      }
    });
  });

  test("Entity.create() with context", function() {
    var Item = base.Entity.configure({
      version:          1,
      partitionKey:     base.Entity.keys.StringKey('id'),
      rowKey:           base.Entity.keys.StringKey('name'),
      properties: {
        id:             base.Entity.types.String,
        name:           base.Entity.types.String,
        count:          base.Entity.types.Number
      },
      context:          ['config', 'maxCount']
    }).setup({
      credentials:  cfg.get('azure'),
      table:        cfg.get('azureTestTableName'),
      context: {
        config:     "My config object",
        maxCount:   10
      }
    });
    return Item.ensureTable().then(function() {
      return Item.create({
        id:     slugid.v4(),
        name:   'my-test-item',
        count:  1
      });
    }).then(function(item) {
      assert(item.config === "My config object", "Missing 'cfg' from context");
      assert(item.maxCount === 10, "Missing 'maxCount' from context");
    });
  });

  test("Entity migration with context", function() {
    var Item = base.Entity.configure({
      version:          1,
      partitionKey:     base.Entity.keys.StringKey('id'),
      rowKey:           base.Entity.keys.StringKey('name'),
      properties: {
        id:             base.Entity.types.String,
        name:           base.Entity.types.String,
        count:          base.Entity.types.Number
      },
      context:          ['config', 'maxCount']
    }).configure({
      version:          2,
      properties: {
        id:             base.Entity.types.String,
        name:           base.Entity.types.String,
        count:          base.Entity.types.Number,
        reason:         base.Entity.types.String
      },
      context:          ['maxCount'],
      migrate: function(item) {
        return {
          id:           item.id,
          name:         item.name,
          count:        item.count,
          reason:       "no-reason"
        };
      }
    }).setup({
      credentials:  cfg.get('azure'),
      table:        cfg.get('azureTestTableName'),
      context: {
        maxCount:  11
      }
    });
    return Item.ensureTable().then(function() {
      return Item.create({
        id:       slugid.v4(),
        name:     'my-test-item',
        count:    1,
        reason:   'i-said-so'
      });
    }).then(function(item) {
      assert(item.maxCount === 11, "Missing 'maxCount' from context");
    });
  });

  test("Entity.configure().setup() with undeclared context", function() {
    try {
      base.Entity.configure({
        version:          1,
        partitionKey:     base.Entity.keys.StringKey('id'),
        rowKey:           base.Entity.keys.StringKey('name'),
        properties: {
          id:             base.Entity.types.String,
          name:           base.Entity.types.String,
          count:          base.Entity.types.Number
        },
        context:          ['config']
      }).setup({
        credentials:  cfg.get('azure'),
        table:        cfg.get('azureTestTableName'),
        context: {
          config:         "My config object",
          undeclaredKey:  19
        }
      });
    }
    catch(err) {
      return; // Expected error
    }
    assert(false, "Expected an error");
  });

  test("Entity.configure().setup() with missing context", function() {
    try {
      base.Entity.configure({
        version:          1,
        partitionKey:     base.Entity.keys.StringKey('id'),
        rowKey:           base.Entity.keys.StringKey('name'),
        properties: {
          id:             base.Entity.types.String,
          name:           base.Entity.types.String,
          count:          base.Entity.types.Number
        },
        context:          ['config']
      }).setup({
        credentials:  cfg.get('azure'),
        table:        cfg.get('azureTestTableName'),
        context:      {}
      });
    }
    catch(err) {
      return; // Expected error
    }
    assert(false, "Expected an error");
  });
});
