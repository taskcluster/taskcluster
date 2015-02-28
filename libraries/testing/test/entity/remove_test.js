suite("Entity (remove)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');

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


  test("Item.create, item.remove", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function(item) {
      assert(item instanceof Item);
      assert(item.id === id);
      assert(item.count === 1);
      return item.remove();
    }).then(function() {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      });
    }).catch(function(err) {
      assert(err.code === 'ResourceNotFound');
    });
  });


  test("Item.create, Item.remove", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function(item) {
      return Item.remove({
        id:     id,
        name:   'my-test-item'
      });
    }).then(function() {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      });
    }).catch(function(err) {
      assert(err.code === 'ResourceNotFound');
    });
  });

  test("Item.remove (error when doesn't exist)", function() {
    return Item.remove({
      id:     slugid.v4(),
      name:   'my-test-item'
    }).catch(function(err) {
      assert(err.code === 'ResourceNotFound');
    });
  });

  test("Item.remove (ignoreIfNotExists)", function() {
    return Item.remove({
      id:     slugid.v4(),
      name:   'my-test-item'
    }, true);
  });

  test("Item.create, item.remove (abort if changed)", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        return itemB.modify(function() {
          this.count += 1;
        });
      }).then(function() {
        return itemA.remove();
      });
    }).catch(function(err) {
      assert(err.code === 'UpdateConditionNotSatisfied');
    });
  });

  test("Item.create, item.remove (ignore changes)", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        return itemB.modify(function() {
          this.count += 1;
        });
      }).then(function() {
        return itemA.remove(true);
      });
    });
  });

  test("Item.create, item.remove (ignoreIfNotExists)", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function(itemA) {
      return itemA.remove(false, false).then(function() {
        return itemA.remove(false, true);
      });
    });
  });

  test("Item.create, Item.remove (ignoreIfNotExists)", function() {
    var id = slugid.v4();
    return Item.create({
      id:     id,
      name:   'my-test-item',
      count:  1
    }).then(function() {
      return Item.remove({
        id:     id,
        name:   'my-test-item'
      }, false).then(function(result) {
        assert(result === true, "Expected true");
        return Item.remove({
          id:     id,
          name:   'my-test-item'
        }, true).then(function(result) {
          assert(result === false, "Expected false");
        });
      });
    });
  });
});
