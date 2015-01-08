suite("Entity (migration validate-keys)", function() {
  var base    = require('../../');
  var assert  = require('assert');

  test("Can migrate", function() {
    base.Entity.configure({
      version:        1,
      partitionKey:   base.Entity.keys.StringKey('pk'),
      rowKey:         base.Entity.keys.StringKey('rk'),
      properties: {
        pk:           base.Entity.types.String,
        rk:           base.Entity.types.Number
      }
    }).configure({
      version:        2,
      properties: {
        pk:           base.Entity.types.String,
        rk:           base.Entity.types.Number,
        value:        base.Entity.types.String
      },
      migrate: function(item) {
        item.value = "none";
        return item;
      }
    });
  });

  test("Can't define key with missing property", function() {
    assert.throws(function() {
      base.Entity.configure({
        version:        1,
        partitionKey:   base.Entity.keys.StringKey('pk'),
        rowKey:         base.Entity.keys.StringKey('rk'),
        properties: {
          value:        base.Entity.types.String,
          rk:           base.Entity.types.Number
        }
      });
    }, "Expected an error");
  });

  test("Can't migrate key properties (redefinition)", function() {
    assert.throws(function() {
      base.Entity.configure({
        version:        1,
        partitionKey:   base.Entity.keys.StringKey('pk'),
        rowKey:         base.Entity.keys.StringKey('rk'),
        properties: {
          pk:           base.Entity.types.String,
          rk:           base.Entity.types.Number
        }
      }).configure({
        version:        2,
        partitionKey:   base.Entity.keys.StringKey('value'),
        properties: {
          pk:           base.Entity.types.String,
          rk:           base.Entity.types.Number,
          value:        base.Entity.types.String
        },
        migrate: function(item) {
          item.value = "none";
          return item;
        }
      });
    }, "Expected an error");
  });

  test("Can't migrate key properties (rename)", function() {
    assert.throws(function() {
      base.Entity.configure({
        version:        1,
        partitionKey:   base.Entity.keys.StringKey('pk'),
        rowKey:         base.Entity.keys.StringKey('rk'),
        properties: {
          pk:           base.Entity.types.String,
          rk:           base.Entity.types.Number
        }
      }).configure({
        version:        2,
        properties: {
          pk2:          base.Entity.types.String,
          rk:           base.Entity.types.Number
        },
        migrate: function(item) {
          return {
            pk2:    item.pk,
            rk:     item.rk
          };
        }
      });
    }, "Expected an error");
  });

  test("Can't migrate key properties (types)", function() {
    assert.throws(function() {
      base.Entity.configure({
        version:        1,
        partitionKey:   base.Entity.keys.StringKey('pk'),
        rowKey:         base.Entity.keys.StringKey('rk'),
        properties: {
          pk:           base.Entity.types.String,
          rk:           base.Entity.types.Number
        }
      }).configure({
        version:        2,
        properties: {
          pk:           base.Entity.types.Number,
          rk:           base.Entity.types.Number
        },
        migrate: function(item) {
          return {
            pk:     parseInt(item.pk),
            rk:     item.rk
          };
        }
      });
    }, "Expected an error");
  });

  test("Can't start with version 2", function() {
    assert.throws(function() {
      base.Entity.configure({
        version:        2,
        partitionKey:   base.Entity.keys.StringKey('pk'),
        rowKey:         base.Entity.keys.StringKey('rk'),
        properties: {
          pk:           base.Entity.types.String,
          rk:           base.Entity.types.Number
        }
      });
    }, "Expected an error");
  });

  test("Can't migrate with version + 2", function() {
    assert.throws(function() {
      base.Entity.configure({
        version:        1,
        partitionKey:   base.Entity.keys.StringKey('pk'),
        rowKey:         base.Entity.keys.StringKey('rk'),
        properties: {
          pk:           base.Entity.types.String,
          rk:           base.Entity.types.Number
        }
      }).configure({
        version:        3,
        properties: {
          pk:           base.Entity.types.String,
          rk:           base.Entity.types.Number
        },
        migrate: function(item) {
          return {
            pk:     parseInt(item.pk),
            rk:     item.rk
          };
        }
      });
    }, "Expected an error");
  });
});