const helper = require('./helper');
const {
  Schema,
  Database,
  READ,
  DUPLICATE_OBJECT,
  UNDEFINED_COLUMN,
  UNDEFINED_TABLE,
} = require('..');
const path = require('path');
const assert = require('assert').strict;
const { runMigration, runDowngrade } = require('../src/migration');

helper.dbSuite(path.basename(__filename), function() {
  let db;

  const createUsers = async db => {
    await db._withClient('admin', async client => {
      const usernames = ['test_service1', 'test_service2', 'badrole'];

      // create users (same as roles) so the grants will succeed
      for (const username of usernames) {
        try {
          await client.query(`create user ${username}`);
        } catch (err) {
          if (err.code !== DUPLICATE_OBJECT) {
            throw err;
          }
        }
      }
    });
    // start off the roles from a clean slate..
    await resetRoles(db);
  };

  const resetRoles = async db => {
    await db._withClient('admin', async client => {
      // drop attributes and group membership for all test_* users
      const res = await client.query(`
        select *
        from pg_catalog.pg_roles
        where rolname like 'test\_%'`);
      for (const row of res.rows) {
        // both of these are successful if they are no-ops (although they show warnings)
        await client.query(`alter role ${row.rolname} with nosuperuser nocreatedb nocreaterole noreplication`);
        await client.query(`revoke badrole from ${row.rolname}`);
      }
    });
  };

  suiteTeardown(async function() {
    db = new Database({ urlsByMode: { admin: helper.dbUrl } });
    await resetRoles(db);
  });

  teardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  suite('runMigration', function() {
    suiteSetup(async function() {
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await createUsers(db);
    });

    setup(function() {
      db = new Database({ urlsByMode: { [READ]: helper.dbUrl, 'admin': helper.dbUrl } });
    });

    test('runs upgrade script with multiple statements and $db_user_prefix$', async function() {
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: {
            version: 1,
            migrationScript: `begin
              create table foo as select 1 as bar;
              create table foo2 as select 2 as bar2;
              grant select on foo2 to $db_user_prefix$_service1;
            end`,
            methods: {},
          },
          showProgress: () => {},
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 1);
      await db._withClient(READ, async client => {
        let res = await client.query('select * from foo');
        assert.deepEqual(res.rows, [{ bar: 1 }]);
        res = await client.query('select * from foo2');
        assert.deepEqual(res.rows, [{ bar2: 2 }]);
      });
    });

    test('failure does not modify version', async function() {
      try {
        await db._withClient('admin', async client => {
          await runMigration({
            client,
            version: {
              version: 1,
              migrationScript: `begin
                select nosuchcolumn from tcversion;
              end`,
              methods: {},
            },
            showProgress: () => {},
            usernamePrefix: 'test',
          });
        });

      } catch (err) {
        assert.equal(err.code, UNDEFINED_COLUMN);
        assert.equal(await db.currentVersion(), 0);
        return;
      }
      throw new Error('runMigration did not fail');
    });

    test('allows deprecated methods without failing', async function() {
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: {
            version: 1,
            methods: { foo_bar: {
              description: 'whatever',
              mode: 'read',
              serviceName: 'baz',
              args: 'foo integer',
              returns: 'table (bar integer)',
              body: 'begin end',
            } },
          },
          showProgress: () => {},
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 1);
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: {
            version: 2,
            methods: { foo_bar: { deprecated: true } },
          },
          showProgress: () => {},
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 2);
    });
  });

  suite('runDowngrade', function() {
    suiteSetup(async function() {
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await createUsers(db);
    });

    const v1 = {
      version: 1,
      methods: {
        test: {
          args: '',
          returns: 'int',
          mode: 'read',
          serviceName: 'service-1',
          description: 'test v1',
          body: 'begin return 1; end',
        },
      },
    };

    const v2 = {
      version: 2,
      migrationScript: `begin
        create table foo as select 1 as bar;
        grant select on foo to $db_user_prefix$_service1;
      end`,
      downgradeScript: `begin
        revoke select on foo from $db_user_prefix$_service1;
        drop table foo;
      end`,
      methods: {},
    };

    const v3 = {
      version: 3,
      migrationScript: `begin
        create table foo2 as select 1 as bar;
        grant select on foo2 to $db_user_prefix$_service2;
      end`,
      downgradeScript: `begin
        revoke select on foo2 from $db_user_prefix$_service2;
        drop table foo2;
      end`,
      methods: {
        test: {
          args: '',
          returns: 'int',
          mode: 'read',
          serviceName: 'service-1',
          description: 'test v3',
          body: 'begin return 3; end',
        },
      },
    };
    const v4 = {
      version: 4,
      methods: {
        test: {
          deprecated: true,
        },
      },
    };
    const access = {};
    const tables = {};
    const schema = Schema.fromSerializable({ versions: [v1, v2, v3, v4], access, tables });

    const testMethod = async (client, v) => {
      const res = await client.query('select test()');
      assert.equal(res.rows[0].test, v);
    };

    setup(async function() {
      db = new Database({ urlsByMode: { [READ]: helper.dbUrl, 'admin': helper.dbUrl } });
      for (let version of [v1, v2, v3]) {
        await db._withClient('admin', async client => {
          await runMigration({
            client,
            version,
            showProgress: () => {},
            usernamePrefix: 'test',
          });
        });

      }
    });

    test('runs downgrade script with multiple statements and $db_user_prefix$', async function() {
      await db._withClient('admin', async client => {
        await runDowngrade({
          client,
          schema,
          fromVersion: v3,
          toVersion: v2,
          showProgress: () => {},
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 2);
      await db._withClient('admin', async client => {
        await assert.rejects(async () => {
          await client.query('select * from foo2');
        }, err => err.code === UNDEFINED_TABLE);
        // method is now the v1 method
        await testMethod(client, 1);
      });
    });

    test('failure does not modify version', async function() {
      await db._withClient('admin', async client => {
        await assert.rejects(
          async () => runDowngrade({
            client,
            schema,
            fromVersion: {
              ...v3,
              downgradeScript: `begin
                drop table NOSUCHTABLE;
              end`,
            },
            toVersion: v2,
            showProgress: () => {},
            usernamePrefix: 'test',
          }),
          err => err.code === UNDEFINED_TABLE);
      });
      assert.equal(await db.currentVersion(), 3);
      await db._withClient('admin', async client => {
        // method is still the v3 method
        await testMethod(client, 3);
      });
    });

    test('allows deprecated methods without failing', async function() {
      await db._withClient('admin', async client => {
        await runMigration({
          client,
          version: v4,
          showProgress: () => {},
          usernamePrefix: 'test',
        });
      });

      await db._withClient('admin', async client => {
        await runDowngrade({
          client,
          schema,
          fromVersion: v4,
          toVersion: v3,
          showProgress: () => {},
          usernamePrefix: 'test',
        });
      });

      assert.equal(await db.currentVersion(), 3);
    });
  });
});
