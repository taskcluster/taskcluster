const Access = require('../src/Access');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  suite('checking', function() {
    test('not an object', function() {
      assert.throws(
        () => Access.fromSerializable([]),
        /should define an object/);
    });
    test('not an object of objects', function() {
      assert.throws(
        () => Access.fromSerializable({ test: [] }),
        /should define an object/);
    });
    test('service has keys aside from tables', function() {
      assert.throws(
        () => Access.fromSerializable({ test: { views: [] } }),
        /should only have a 'tables' property/);
    });
    test('service tables is an array', function() {
      assert.throws(
        () => Access.fromSerializable({ test: { tables: [] } }),
        /should be an object/);
    });
    test('service tables has invalid mode', function() {
      assert.throws(
        () => Access.fromSerializable({ test: { tables: { test: 'admin' } } }),
        /should be read or write/);
    });
  });
});
