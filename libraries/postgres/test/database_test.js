const helper = require('./helper');
const {Schema, Database, READ, WRITE} = require('..');
const path = require('path');
const assert = require('assert').strict;

helper.dbSuite(path.basename(__filename), function() {
  let db;

  const versions = [
    {
      version: 1,
      migrationScript: `begin
        create table testing (a integer, b integer);
      end`,
      methods: {
        testdata: {
          description: 'test',
          mode: 'write',
          serviceName: 'service-1',
          args: '',
          returns: 'void',
          body: `begin
            insert into testing values (1, 2), (3, 4);
          end`,
        },
        addup: {
          description: 'test',
          mode: 'read',
          serviceName: 'service-2',
          args: 'x integer',
          returns: 'table (total integer)',
          body: `begin
            return query select a+b+x as total from testing;
          end`,
        },
      },
    },
  ];
  const schema = Schema.fromSerializable({versions, access: {}});

  teardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  suite('db.currentVersion', function() {
    setup(function() {
      db = new Database({urlsByMode: {[READ]: helper.dbUrl, [WRITE]: helper.dbUrl}});
    });

    test('currentVersion with no version set', async function() {
      assert.equal(await db.currentVersion(), 0);
    });

    test('currentVersion after set', async function() {
      await db._withClient(WRITE, async client => {
        await client.query('begin');
        await client.query('create table if not exists tcversion as select 0 as version');
        await client.query('update tcversion set version = $1', [3]);
        await client.query('commit');
      });
      assert.equal(await db.currentVersion(), 3);
    });
  });

  suite('db._doUpgrade', function() {
    suiteSetup(async function() {
      db = new Database({urlsByMode: {admin: helper.dbUrl}});
      await db._withClient('admin', async client => {
        // create users so the grants will succeed
        for (let username of ['test_service1', 'test_service2']) {
          try {
            await client.query(`create user ${username}`);
          } catch (err) {
            if (err.code !== '42710') { // role already exists
              throw err;
            }
          }
        }
      });
    });

    setup(function() {
      db = new Database({urlsByMode: {[READ]: helper.dbUrl, 'admin': helper.dbUrl}});
    });

    test('_doUpgrade runs upgrade script with multiple statements and $db_user_prefix$', async function() {
      await db._doUpgrade({
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
      assert.equal(await db.currentVersion(), 1);
      await db._withClient(READ, async client => {
        let res = await client.query('select * from foo');
        assert.deepEqual(res.rows, [{bar: 1}]);
        res = await client.query('select * from foo2');
        assert.deepEqual(res.rows, [{bar2: 2}]);
      });
    });

    test('failed _doUpgrade does not modify version', async function() {
      try {
        await db._doUpgrade({
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
      } catch (err) {
        assert.equal(err.code, '42703'); // unknown column
        assert.equal(await db.currentVersion(), 0);
        return;
      }
      throw new Error('_doUpgrade did not fail');
    });
  });

  suite('Database._checkPermissions', function() {
    let db;

    suiteSetup(async function() {
      db = new Database({urlsByMode: {admin: helper.dbUrl}});
      await db._withClient('admin', async client => {
        // create users so the grants will succeed
        for (let username of ['test_service1', 'test_service2']) {
          try {
            await client.query(`create user ${username}`);
          } catch (err) {
            if (err.code !== '42710') { // role already exists
              throw err;
            }
          }
        }
      });
    });

    setup(async function() {
      await db._withClient('admin', async client => {
        // create some tables for permissions
        await client.query('create table tcversion (version int)');
        await client.query('create table foo (fooId int)');
        await client.query('create table bar (barId int)');
      });
    });

    suiteTeardown(async function() {
      await db.close();
    });

    test('empty access.yml', async function() {
      const schema = {access: {service1: {tables: {}}, service2: {tables: {}}}, versions: []};
      await Database._checkPermissions({db, schema, usernamePrefix: 'test'});
      // does not fail
    });

    test('permissions missing', async function() {
      const schema = {
        access: {
          service1: {tables: {foo: 'read'}},
          service2: {tables: {foo: 'write'}},
        },
        versions: [],
      };
      await assert.rejects(() => Database._checkPermissions({db, schema, usernamePrefix: 'test'}),
        /missing database user grant: test_service1: SELECT on foo/);
    });

    test('extra permissions', async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
        await client.query('grant select on bar to test_service2');
      });
      const schema = {
        access: {
          service1: {tables: {foo: 'read'}},
          service2: {tables: {foo: 'write'}},
        },
        versions: [],
      };
      await assert.rejects(() => Database._checkPermissions({db, schema, usernamePrefix: 'test'}),
        /unexpected database user grant: test_service2: SELECT on bar/);
    });

    test('extra column permissions', async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
        // grant access only to the `barId` column on bar
        await client.query('grant select(barId) on bar to test_service2');
      });
      const schema = {
        access: {
          service1: {tables: {foo: 'read'}},
          service2: {tables: {foo: 'write'}},
        },
        versions: [],
      };
      await assert.rejects(() => Database._checkPermissions({db, schema, usernamePrefix: 'test'}),
        /unexpected database user grant: test_service2: SELECT on bar/);
    });

    test('correct permissions', async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
      });
      const schema = {
        access: {
          service1: {tables: {foo: 'read'}},
          service2: {tables: {foo: 'write'}},
        },
        versions: [],
      };
      await Database._checkPermissions({db, schema, usernamePrefix: 'test'});
      // does not fail
    });
  });

  suite('Database.setup', function() {
    test('setup creates JS methods that can be called', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1'});
      await db.procs.testdata();
      const res = await db.procs.addup(13);
      assert.deepEqual(res.map(r => r.total).sort(), [16, 20]);
    });

    test('do not allow service A to call any methods for service B which have mode=WRITE', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-2'});

      assert.equal(versions[0].methods.testdata.serviceName, 'service-1');
      assert.equal(versions[0].methods.testdata.mode, WRITE);
      await assert.rejects(db.procs.testdata, /not allowed to call/);
      await db.close();
    });

    test('allow service A to call any methods for service A which have mode=WRITE', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1'});

      assert.equal(versions[0].methods.testdata.serviceName, 'service-1');
      assert.equal(versions[0].methods.testdata.mode, WRITE);
      await db.procs.testdata();
      await db.close();
    });

    test('allow service A to call any methods for service B which have mode=READ', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1'});

      assert.equal(versions[0].methods.addup.serviceName, 'service-2');
      assert.equal(versions[0].methods.addup.mode, READ);
      await db.procs.testdata();
      await db.close();
    });
  });
});
