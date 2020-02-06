const Version = require('../src/Version');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  suite('Version._checkContent', function() {
    test('version field required', function() {
      assert.throws(
        () => Version._checkContent({migrationScript: 'yup', methods: {}}, '0001.yml'),
        /version field missing/);
    });

    test('migrationScript field required', function() {
      assert.throws(
        () => Version._checkContent({version: 1, methods: {}}, '0001.yml'),
        /migrationScript field missing/);
    });

    test('methods field required', function() {
      assert.throws(
        () => Version._checkContent({version: 1, migrationScript: 'yep'}, '0001.yml'),
        /methods field missing/);
    });

    test('version does not match filename', function() {
      assert.throws(
        () => Version._checkContent({version: 2, migrationScript: 'yep', methods: {}}, '0001.yml'),
        /must match version/);
    });
  });
});
