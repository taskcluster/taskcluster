import Schema from '../src/Schema.js';
import path from 'node:path';
import { strict as assert } from 'node:assert';

const __dirname = new URL('.', import.meta.url).pathname;
const __filename = new URL('', import.meta.url).pathname;

suite(path.basename(__filename), () => {
  suite('fromDbDirectory', () => {
    test('fromDbDirectory', () => {
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

    test('fromDbDirectory with external SQL files', () => {
      const sch = Schema.fromDbDirectory(path.join(__dirname, 'db-simple'));
      const ver1 = sch.getVersion(1);
      assert(ver1.migrationScript.startsWith('begin'));

      const ver2 = sch.getVersion(2);
      assert(ver2.methods.list_secrets.body.startsWith('begin'));
    });

    test('disallow duplicate method names', () => {
      assert.throws(() => {
        Schema.fromDbDirectory(path.join(__dirname, 'db-with-duplicate-method-names'));
      }, /duplicated mapping key/);
    });

    test('disallow gaps in version numbers', () => {
      assert.throws(() => {
        Schema.fromDbDirectory(path.join(__dirname, 'db-with-gaps'));
      }, /version 2 is missing/);
    });

    test('disallow duplicate version numbers', () => {
      assert.throws(() => {
        Schema.fromDbDirectory(path.join(__dirname, 'db-with-dupes'));
      }, /duplicate version number 1 in/);
    });

    test('allow method deprecations', () => {
      Schema.fromDbDirectory(path.join(__dirname, 'db-with-depr'));
      // does not crash..
    });

  });

  suite('fromSerializable', () => {
    test('fromSerializable', () => {
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

  suite('_checkMethodUpdates', () => {
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

    test('method changes mode', () => {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({ mode: 'write' })),
        /method whatever changed mode in version 2/);
    });

    test('method changes serviceName', () => {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({ serviceName: 'queue' })),
        /method whatever changed serviceName in version 2/);
    });

    test('method changes args', () => {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({ args: 'x text' })),
        /method whatever changed args in version 2/);
    });

    test('method changes returns', () => {
      assert.throws(
        () => Schema._checkMethodUpdates(versions({ returns: 'text' })),
        /method whatever changed returns in version 2/);
    });
  });

  test('allMethods', () => {
    const sch = Schema.fromDbDirectory(path.join(__dirname, 'db-simple'));
    assert.deepEqual([...sch.allMethods().map(meth => meth.name)].sort(),
      ['get_secret', 'list_secrets']);
  });
});
