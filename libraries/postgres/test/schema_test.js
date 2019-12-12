const {Schema, READ} = require('..');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  suite('construction', function() {
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
          {name: 'get_secret', mode: READ},
          {name: 'list_secrets', mode: READ},
        ]);
    });

    test('fromSerializable', function() {
      const sch = Schema.fromSerializable({
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

  test('allMethods', function() {
    const sch = Schema.fromDbDirectory(path.join(__dirname, 'db-simple'));
    assert.deepEqual([...sch.allMethods()].sort(),
      [
        {name: 'get_secret', mode: READ},
        {name: 'list_secrets', mode: READ},
      ]);
  });
});
