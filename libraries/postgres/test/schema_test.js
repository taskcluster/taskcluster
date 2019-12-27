const {Schema, READ} = require('..');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  suite('fromDbDirectory', function() {
    test('fromDbDirectory', function() {
      const sch = Schema.fromDbDirectory(path.join(__dirname, 'db-simple'));
      const ver2 = sch.latestVersion();
      assert.equal(ver2.version, 2);
      assert.deepEqual(Object.keys(ver2.methods), ['list_secrets']);
      assert(ver2.migrationScript.startsWith('begin'));
      assert.deepEqual(ver2, sch.getVersion(2));

      const ver1 = sch.getVersion(1);
      assert.deepEqual(Object.keys(ver1.methods), ['get_secret']);

      assert.deepEqual([...sch.allMethods()].sort(),
        [
          {name: 'get_secret', mode: READ, serviceName: 'secrets', args: 'name text', returns: 'table (secret text)', description: 'test'},
          {name: 'list_secrets', mode: READ, serviceName: 'secrets', args: '', returns: 'table (name text, expires timestamp)', description: 'test' },
        ]);
    });

    test('disallow duplicate method names', function () {
      assert.throws(() => {
        Schema.fromDbDirectory(path.join(__dirname, 'db-with-duplicate-method-names'));
      }, /duplicated mapping key/);
    });

    test('disallow gaps in version numbers', function () {
      assert.throws(() => {
        Schema.fromDbDirectory(path.join(__dirname, 'db-with-gaps'));
      }, /version 2 is missing/);
    });

    test('disallow duplicate version numbers', function () {
      assert.throws(() => {
        Schema.fromDbDirectory(path.join(__dirname, 'db-with-dupes'));
      }, /duplicate version number 1 in/);
    });
  });

  suite('fromSerializable', function() {
    test('fromSerializable', function() {
      const sch = Schema.fromSerializable({
        access: {},
        versions: [
          {
            version: 1,
            methods: {
              reset: {
                mode: 'write',
                args: '',
                returns: 'void',
                body: 'begin delete from sometable; end',
              },
            },
          },
        ],
      });
      const ver1 = sch.getVersion(1);
      assert.deepEqual(Object.keys(ver1.methods), ['reset']);
    });
  });

  suite('_checkVersion', function() {
    test('version field required', function() {
      assert.throws(
        () => Schema._checkVersion({migrationScript: 'yup', methods: {}}, '0001.yml'),
        /version field missing/);
    });

    test('migrationScript field required', function() {
      assert.throws(
        () => Schema._checkVersion({version: 1, methods: {}}, '0001.yml'),
        /migrationScript field missing/);
    });

    test('methods field required', function() {
      assert.throws(
        () => Schema._checkVersion({version: 1, migrationScript: 'yep'}, '0001.yml'),
        /methods field missing/);
    });

    test('version does not match filename', function() {
      assert.throws(
        () => Schema._checkVersion({version: 2, migrationScript: 'yep', methods: {}}, '0001.yml'),
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
        () => Schema._checkVersion({version: 1, migrationScript: 'yep', methods}, '0001.yml'),
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
        () => Schema._checkVersion({version: 1, migrationScript: 'yep', methods}, '0001.yml'),
        /db procedure method cApItAlLeTtErS in 0001.yml has capital letters/);
    });
  });

  suite('_checkVersion', function() {
    const versions = v2overrides => [
      {
        version: 1,
        methods: {
          whatever: {
            description: 'test',
            mode: 'read',
            serviceName: 'test',
            args: 'x integer',
            returns: 'void',
          },
        },
      },
      {
        version: 2,
        methods: {
          whatever: {
            description: 'test',
            mode: 'read',
            serviceName: 'test',
            args: 'x integer',
            returns: 'void',
            ...v2overrides,
          },
        },
      },
    ];

    test('method changes mode', function() {
      assert.throws(
        () => Schema._checkMethods(versions({mode: 'write'})),
        /method whatever changed mode in version 2/);
    });

    test('method changes serviceName', function() {
      assert.throws(
        () => Schema._checkMethods(versions({serviceName: 'queue'})),
        /method whatever changed serviceName in version 2/);
    });

    test('method changes args', function() {
      assert.throws(
        () => Schema._checkMethods(versions({args: 'x text'})),
        /method whatever changed args in version 2/);
    });

    test('method changes returns', function() {
      assert.throws(
        () => Schema._checkMethods(versions({returns: 'text'})),
        /method whatever changed returns in version 2/);
    });
  });

  suite('_checkAccess', function() {
    test('not an object', function() {
      assert.throws(
        () => Schema._checkAccess([]),
        /should define an object/);
    });
    test('not an object of objects', function() {
      assert.throws(
        () => Schema._checkAccess({test: []}),
        /should define an object/);
    });
    test('service has keys aside from tables', function() {
      assert.throws(
        () => Schema._checkAccess({test: {views: []}}),
        /should only have a `tables` property/);
    });
    test('service tables is an array', function() {
      assert.throws(
        () => Schema._checkAccess({test: {tables: []}}),
        /should be an object/);
    });
    test('service tables has invalid mode', function() {
      assert.throws(
        () => Schema._checkAccess({test: {tables: {test: 'admin'}}}),
        /should be read or write/);
    });
  });

  test('allMethods', function() {
    const sch = Schema.fromDbDirectory(path.join(__dirname, 'db-simple'));
    assert.deepEqual([...sch.allMethods()].sort(),
      [
        {name: 'get_secret', mode: READ, serviceName: 'secrets', args: 'name text', returns: 'table (secret text)', description: 'test'},
        {name: 'list_secrets', mode: READ, serviceName: 'secrets', args: '', returns: 'table (name text, expires timestamp)', description: 'test'},
      ]);
  });
});
