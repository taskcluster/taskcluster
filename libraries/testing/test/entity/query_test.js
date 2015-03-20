suite("Entity (query)", function() {
  var assert  = require('assert');
  var slugid  = require('slugid');
  var _       = require('lodash');
  var Promise = require('promise');
  var base    = require('../../');
  var debug   = require('debug')('base:test:entity:query');

  var helper  = require('./helper');
  var cfg = helper.loadConfig();

  var Item = base.Entity.configure({
    version:          1,
    partitionKey:     base.Entity.keys.StringKey('id'),
    rowKey:           base.Entity.keys.StringKey('name'),
    properties: {
      id:             base.Entity.types.String,
      name:           base.Entity.types.String,
      count:          base.Entity.types.Number,
      tag:            base.Entity.types.String
    }
  }).setup({
    credentials:  cfg.get('azure'),
    table:        cfg.get('azureTestTableName'),
    drain:        new base.stats.NullDrain(),
    component:    'taskcluster-base-test',
    process:      'mocha'
  });

  var id = slugid.v4();
  before(function() {
    return Promise.all([
      Item.create({
        id:     id,
        name:   'item1',
        count:  1,
        tag:    'tag1'
      }),
      Item.create({
        id:     id,
        name:   'item2',
        count:  2,
        tag:    'tag2'
      }),
      Item.create({
        id:     id,
        name:   'item3',
        count:  3,
        tag:    'tag1'    // same tag as item1
      })
    ]);
  });

  test("Query a partition", function() {
    return Item.query({id: id}).then(function(data) {
      assert(data.entries.length === 3);
      var sum = 0;
      data.entries.forEach(function(item) {
        sum += item.count;
      });
      assert(sum === 6);
    });
  });

  test("Query a partition (with Entity.op.equal)", function() {
    return Item.query({
      id:     base.Entity.op.equal(id)
    }).then(function(data) {
      assert(data.entries.length === 3);
      var sum = 0;
      data.entries.forEach(function(item) {
        sum += item.count;
      });
      assert(sum === 6);
    });
  });

  test("Can't query without partition-key", function() {
    return Promise.resolve().then(function() {
     return Item.query({
        name:   'item1',
        count:  1,
        tag:    'tag1'
      });
    }).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      debug("Caught expected error: %j", err)
    });
  });

  test("Query a partition (with limit 2)", function() {
    return Item.query({id: id}, {
      limit:      2
    }).then(function(data) {
      assert(data.entries.length === 2);
      assert(data.continuation);

      // Fetch next
      return Item.query({id: id}, {
        limit:          2,
        continuation:   data.continuation
      }).then(function(data) {
        assert(data.entries.length === 1);
        assert(!data.continuation);
      });
    });
  });

  test("Query a partition (with handler)", function() {
    var sum = 0;
    return Item.query({id: id}, {
      handler:      function(item) { sum += item.count; }
    }).then(function() {
      assert(sum === 6);
    });
  });

  test("Query a partition (with async handler)", function() {
    var sum = 0;
    return Item.query({id: id}, {
      handler:      function(item) {
        return new Promise(function(accept) {
          setTimeout(function() {
            sum += item.count;
            accept();
          }, 150);
        });
      }
    }).then(function() {
      assert(sum === 6);
    });
  });

  test("Query a partition (with handler and limit 2)", function() {
    var sum = 0;
    return Item.query({id: id}, {
      limit:        2,
      handler:      function(item) { sum += item.count; }
    }).then(function() {
      assert(sum === 6);
    });
  });

  test("Query a partition (with async handler and limit 2)", function() {
    var sum = 0;
    return Item.query({id: id}, {
      limit:        2,
      handler:      function(item) {
        return new Promise(function(accept) {
          setTimeout(function() {
            sum += item.count;
            accept();
          }, 150);
        });
      }
    }).then(function() {
      assert(sum === 6);
    });
  });

  test("Filter by tag", function() {
    var sum = 0;
    return Item.query({
      id:     id,
      tag:    'tag1'
    }).then(function(data) {
      assert(data.entries.length === 2);
      data.entries.forEach(function(item) {
        assert(item.tag === 'tag1');
      });
    });
  });

  test("Filter by tag (with handler)", function() {
    var sum = 0;
    return Item.query({
      id:     id,
      tag:    'tag1'
    }, {
      handler:      function(item) { sum += item.count; }
    }).then(function() {
      assert(sum === 4);
    });
  });

  test("Filter by count < 3", function() {
    return Item.query({
      id:       id,
      count:    base.Entity.op.lessThan(3)
    }).then(function(data) {
      assert(data.entries.length === 2);
      data.entries.forEach(function(item) {
        assert(item.count < 3);
      });
    });
  });

  test("Query for specific row (matchRow: exact)", function() {
    return Item.query({
      id:     id,
      name:   'item2'
    }, {
      matchRow:   'exact'
    }).then(function(data) {
      assert(data.entries.length === 1);
      data.entries.forEach(function(item) {
        assert(item.tag === 'tag2');
      });
    });
  });

  test("Can't use matchRow: exact without row-key", function() {
    return Promise.resolve().then(function() {
      return Item.query({
        id:     id,
      }, {
        matchRow:   'exact'
      });
    }).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      debug("Caught expected error: %j", err);
    });
  });
});
