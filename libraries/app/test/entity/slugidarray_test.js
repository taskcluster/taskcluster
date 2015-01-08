suite("Entity (SlugIdArrayType)", function() {
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
      data:           base.Entity.types.SlugIdArray
    }
  }).setup({
    credentials:  cfg.get('azure'),
    table:        cfg.get('azureTestTableName')
  });

  test("SlugIdArray.push", function() {
    var arr = base.Entity.types.SlugIdArray.create();
    var id = slugid.v4();
    arr.push(id);
  });

  test("SlugIdArray.push (with 1k ids)", function() {
    var arr = base.Entity.types.SlugIdArray.create();
    for(var i = 0; i < 1000; i++) {
      arr.push(slugid.v4());
    }
  });

  test("SlugIdArray.indexOf", function() {
    var arr = base.Entity.types.SlugIdArray.create();
    var id = slugid.v4();
    arr.push(id);
    assert(arr.indexOf(id) !== -1);
  });

  test("SlugIdArray.indexOf (with 1k ids)", function() {
    var arr = base.Entity.types.SlugIdArray.create();
    var list = [];
    for(var i = 0; i < 1000; i++) {
      var id = slugid.v4();
      list.push(id);
      arr.push(id);
    }
    list.forEach(function(id) {
      assert(arr.indexOf(id) !== -1, "Expected slugid to be present in array");
    });
    for(var i = 0; i < 1000; i++) {
      var id = slugid.v4();
      assert(arr.indexOf(id) === list.indexOf(id),
             "Slugid present but not pushed!!");
    }
  });

  test("SlugIdArray.remove", function() {
    var arr = base.Entity.types.SlugIdArray.create();
    var list = [];
    for(var i = 0; i < 1000; i++) {
      var id = slugid.v4();
      list.push(id);
      arr.push(id);
    }
    list.forEach(function(id) {
      assert(arr.remove(id), "Expected slugid to be present");
    });
    list.forEach(function(id) {
      assert(arr.indexOf(id) === -1, "Expected slugid to be removed");
    });
  });

  test("SlugIdArray.clone", function() {
    var arr = base.Entity.types.SlugIdArray.create();
    for(var i = 0; i < 200; i++) {
      arr.push(slugid.v4());
    }
    var arr2 = arr.clone();
    assert(arr.equals(arr2));

    var id = slugid.v4();
    arr.push(id);
    var id2 = slugid.v4();
    arr2.push(id2);

    assert(arr.indexOf(id) !== -1, "id in arr");
    assert(arr.indexOf(id2) === -1, "id2 not in arr");
    assert(arr2.indexOf(id) === -1, "id not in arr2");
    assert(arr2.indexOf(id2) !== -1, "id2 in arr2");
    assert(!arr.equals(arr2));
  });

  test("SlugIdArray.equals (with 1k ids)", function() {
    var arr = base.Entity.types.SlugIdArray.create();
    var arr2 = base.Entity.types.SlugIdArray.create();
    for(var i = 0; i < 1000; i++) {
      var id = slugid.v4();
      arr.push(id);
      arr2.push(id);
    }
    assert(arr.equals(arr2));
  });

  // Generate random slugIdArrays
  var randomSlugIdArray = function(length) {
    var arr = base.Entity.types.SlugIdArray.create();
    for (var i = 0; i < length; i++) {
      arr.push(slugid.v4());
    }
    return arr;
  };

  test("small slugid array", function() {
    var id    = slugid.v4();
    var arr   = randomSlugIdArray(42);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   arr
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data.equals(itemB.data));
        assert(itemA.data.equals(arr));
      });
    });
  });


  test("large slugid array (4k ids, 64kb)", function() {
    var id    = slugid.v4();
    var arr   = randomSlugIdArray(4 * 1024);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   arr
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data.equals(itemB.data));
        assert(itemA.data.equals(arr));
      });
    });
  });

  test("large slugid array (8k ids, 128kb)", function() {
    var id    = slugid.v4();
    var arr   = randomSlugIdArray(8 * 1024);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   arr
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data.equals(itemB.data));
        assert(itemA.data.equals(arr));
      });
    });
  });

  test("large slugid array (16k ids, 256kb)", function() {
    var id    = slugid.v4();
    var arr   = randomSlugIdArray(16 * 1024);
    return Item.create({
      id:     id,
      name:   'my-test-item',
      data:   arr
    }).then(function(itemA) {
      return Item.load({
        id:     id,
        name:   'my-test-item'
      }).then(function(itemB) {
        assert(itemA.data.equals(itemB.data));
        assert(itemA.data.equals(arr));
      });
    });
  });
});
