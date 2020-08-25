const Relations = require('../src/Relations');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  suite('checking', function() {
    test('not an object', function() {
      assert.throws(
        () => Relations._check([], 'f'),
        /should define an object/);
    });
    test('not an object of objects', function() {
      assert.throws(
        () => Relations.fromSerializable({ test: [] }, 'f'),
        /should define an object/);
    });
    test('table column values are not strings', function() {
      assert.throws(
        () => Relations.fromSerializable({ test: { name: [] } }),
        /should be a string/);
    });
  });
});
