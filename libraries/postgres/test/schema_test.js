const {Schema} = require('..');
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

      assert.deepEqual([...sch.allMethods().map(meth => meth.name)].sort(),
        ['get_secret', 'list_secrets']);

      assert.deepEqual(sch.tables.get(), {
        secrets: {
          name: 'text not null',
          secret: 'text',
          expires: 'timestamp not null',
        },
      });
    });

    test('fromDbDirectory with external SQL files', function() {
      const sch = Schema.fromDbDirectory(path.join(__dirname, 'db-simple'));
      const ver1 = sch.getVersion(1);
      assert(ver1.migrationScript.startsWith('begin'));

      const ver2 = sch.getVersion(2);
      assert(ver2.methods['list_secrets'].body.startsWith('begin'));
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

    test('allow method deprecations', function () {
      Schema.fromDbDirectory(path.join(__dirname, 'db-with-depr'));
      // does not crash..
    });

  });

  suite('fromSerializable', function() {
    test('fromSerializable', function() {
      const sch = Schema.fromSerializable({
        access: {},
        tables: {},
        versions: [
          {
            version: 1,
            methods: {
              reset: {
                description: 'reset',
                serviceName: 'testy',
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

  suite('_checkMethodUpdates', function() {
    const versions = v2overrides => Schema.fromSerializable({
      versions: [
        {
          version: 1,
          methods: {
            whatever: {
              description: 'test',
              mode: 'read',
              serviceName: 'test',
              args: 'x integer',
              returns: 'void',
              body: 'hi',
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
              body: 'hi',
              ...v2overrides,
            },
          },
        },
      ],
      access: {},
      tables: {},
    }).versions;

    test('method changes mode', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({mode: 'write'})),
        /method whatever changed mode in db version 2/);
    });

    test('method changes serviceName', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({serviceName: 'queue'})),
        /method whatever changed serviceName in db version 2/);
    });

    test('method changes args', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({args: 'x text'})),
        /method whatever changed args in db version 2/);
    });

    test('method changes returns', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({returns: 'text'})),
        /method whatever changed returns in db version 2/);
    });

    test('changes mode in a different method version', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({version: 1, mode: 'write'})),
        /method whatever changed mode in db version 2/);
    });

    test('changes serviceName in a different method version', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({version: 1, serviceName: 'queue'})),
        /method whatever changed serviceName in db version 2/);
    });

    test('changes args in a different method version', function() {
      Schema._checkMethodUpdates(versions({version: 1, args: 'x text'}));
    });

    test('changes returns in a different method version', function() {
      Schema._checkMethodUpdates(versions({version: 1, returns: 'text'}));
    });

    test('increments version by more than 1', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({version: 2, returns: 'text'})),
        /method incremented version by more than one. The next version for whatever is 1/);
    });

    test('downgrade method version', function() {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({version: -1, returns: 'text'})),
        /method whatever is not allowed to downgrade/);
    });
  });

  test('allMethods', function() {
    const sch = Schema.fromDbDirectory(path.join(__dirname, 'db-simple'));
    assert.deepEqual([...sch.allMethods().map(meth => meth.name)].sort(),
      ['get_secret', 'list_secrets']);
  });
});
