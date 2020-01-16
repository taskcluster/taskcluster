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

    test('method with extra fields', function() {
      const methods = {
        foo: {
          mode: 'read',
          args: 'void',
          returns: 'void',
          description: 'test',
          serviceName: 'test',
          body: 'test',
          extra: 'test',
        },
      };
      assert.throws(
        () => Version._checkContent({version: 1, migrationScript: 'yep', methods}, '0001.yml'),
        /unexpected or missing properties in method foo in 0001.yml/);
    });

    test('method changes mode', function() {
      const methods = {
        cApItAlLeTtErS: {
          description: 'test',
          mode: 'read',
          serviceName: 'test',
          args: 'x integer',
          returns: 'void',
        },
      };

      assert.throws(
        () => Version._checkContent({version: 1, migrationScript: 'yep', methods}, '0001.yml'),
        /db function method cApItAlLeTtErS in 0001.yml has capital letters/);
    });
  });
});
