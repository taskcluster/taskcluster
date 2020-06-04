const helper = require('./helper');
const {
  Schema,
  Database,
  READ,
  WRITE,
  DUPLICATE_OBJECT,
  QUERY_CANCELED,
  READ_ONLY_SQL_TRANSACTION,
  UNDEFINED_COLUMN,
  UNDEFINED_FUNCTION,
  UNDEFINED_TABLE,
} = require('..');
const path = require('path');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

const monitor = helper.monitor;

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
        stringparam: {
          description: 'test',
          mode: 'read',
          serviceName: 'service-2',
          args: 'x text',
          returns: 'text',
          body: `begin
            return 'got ' || x;
          end`,
        },
        readonlywrites: {
          description: 'a read-only method that writes',
          mode: 'read',
          serviceName: 'service-2',
          args: '',
          returns: 'void',
          body: `begin
            insert into testing values (1, 2), (3, 4);
          end`,
        },
        fail: {
          description: 'a method that just fails',
          mode: 'read',
          serviceName: 'service-2',
          args: '',
          returns: 'void',
          body: `begin
            raise exception 'uhoh' using hint = 'intentional error', errcode = '0A000';
          end`,
        },
        slow: {
          description: 'a method that takes a bit',
          mode: 'read',
          serviceName: 'service-2',
          args: '',
          returns: 'void',
          body: `begin
            perform pg_sleep(5);
          end`,
        },
        old: {
          description: 'a method that is deprecated',
          mode: 'read',
          deprecated: true,
          serviceName: 'service-2',
          args: '',
          returns: 'void',
          body: `begin
            perform pg_sleep(5);
          end`,
        },
      },
    },
  ];
  const access = {};
  const tables = {};
  const schema = Schema.fromSerializable({versions, access, tables});

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
    db = new Database({urlsByMode: {admin: helper.dbUrl}});
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
      await createUsers(db);
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
        assert.equal(err.code, UNDEFINED_COLUMN);
        assert.equal(await db.currentVersion(), 0);
        return;
      }
      throw new Error('_doUpgrade did not fail');
    });
  });

  suite('db._doDowngrade', function() {
    suiteSetup(async function() {
      db = new Database({urlsByMode: {admin: helper.dbUrl}});
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
    const schema = Schema.fromSerializable({versions: [v1, v2, v3], access, tables});

    const testMethod = async (client, v) => {
      const res = await client.query('select test()');
      assert.equal(res.rows[0].test, v);
    };

    setup(async function() {
      db = new Database({urlsByMode: {[READ]: helper.dbUrl, 'admin': helper.dbUrl}});
      for (let version of [v1, v2, v3]) {
        await db._doUpgrade({
          version,
          showProgress: () => {},
          usernamePrefix: 'test',
        });
      }
    });

    test('_doDowngrade runs downgrade script with multiple statements and $db_user_prefix$', async function() {
      await db._doDowngrade({
        schema,
        fromVersion: v3,
        toVersion: v2,
        showProgress: () => {},
        usernamePrefix: 'test',
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
      await assert.rejects(
        async () => db._doDowngrade({
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
      assert.equal(await db.currentVersion(), 3);
      await db._withClient('admin', async client => {
        // method is still the v3 method
        await testMethod(client, 3);
      });
    });
  });

  suite('Database._checkPermissions', function() {
    let db;

    suiteSetup(async function() {
      db = new Database({urlsByMode: {admin: helper.dbUrl}});
    });

    setup(async function() {
      await createUsers(db);
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

    const withAccess = access => Schema.fromSerializable({access, tables: {}, versions: []});

    test('empty access.yml', async function() {
      const schema = withAccess({service1: {tables: {}}, service2: {tables: {}}});
      await Database._checkPermissions({db, schema, usernamePrefix: 'test'});
      // does not fail
    });

    test('permissions missing', async function() {
      const schema = withAccess({
        service1: {tables: {foo: 'read'}},
        service2: {tables: {foo: 'write'}},
      });
      await assert.rejects(() => Database._checkPermissions({db, schema, usernamePrefix: 'test'}),
        /missing database user grant: test_service1: SELECT on foo/);
    });

    test('extra permissions', async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
        await client.query('grant select on bar to test_service2');
      });
      const schema = withAccess({
        service1: {tables: {foo: 'read'}},
        service2: {tables: {foo: 'write'}},
      });
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
      const schema = withAccess({
        service1: {tables: {foo: 'read'}},
        service2: {tables: {foo: 'write'}},
      });
      await assert.rejects(() => Database._checkPermissions({db, schema, usernamePrefix: 'test'}),
        /unexpected database user grant: test_service2: SELECT on bar/);
    });

    test('correct permissions', async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
      });
      const schema = withAccess({
        service1: {tables: {foo: 'read'}},
        service2: {tables: {foo: 'write'}},
      });
      await Database._checkPermissions({db, schema, usernamePrefix: 'test'});
      // does not fail
    });

    for (const attr of ['superuser', 'createdb', 'createrole', 'replication']) {
      test(`user with ${attr} attribute`, async function() {
        await db._withClient('admin', async client => {
          await client.query('grant select on foo to test_service1');
          await client.query('grant select, insert, update, delete on foo to test_service2');
          await client.query(`alter user test_service2 with ${attr}`);
        });
        const schema = withAccess({
          service1: {tables: {foo: 'read'}},
          service2: {tables: {foo: 'write'}},
        });
        await assert.rejects(() => Database._checkPermissions({db, schema, usernamePrefix: 'test'}),
          new RegExp(`test_service2 has attribute ${attr.toUpperCase()}`));
      });
    }

    test(`user a member of badrole`, async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
        await client.query(`grant badrole to test_service2`);
      });
      const schema = withAccess({
        service1: {tables: {foo: 'read'}},
        service2: {tables: {foo: 'write'}},
      });
      await assert.rejects(() => Database._checkPermissions({db, schema, usernamePrefix: 'test'}),
        new RegExp(`test_service2 has unexpected role badrole`));
    });
  });

  suite('Database.setup', function() {
    test('setup creates JS methods that can be called', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      await db.fns.testdata();
      const res = await db.fns.addup(13);
      assert.deepEqual(res.map(r => r.total).sort(), [16, 20]);
    });

    test('setup does not create deprecated methods', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      assert(!db.fns.old);
    });

    test('non-numeric statementTimeout is not alloewd', async function() {
      await assert.rejects(() => Database.setup({
        schema,
        readDbUrl: helper.dbUrl,
        writeDbUrl: helper.dbUrl,
        serviceName: 'service-1',
        statementTimeout: 'about 3 seconds',
        monitor,
      }), err => err.code === 'ERR_ASSERTION');
    });

    test('setup creates keyring', async function() {
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      assert(db.keyring);
    });

    test('methods do not allow SQL injection', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      await db.fns.testdata();
      const res = await db.fns.stringparam("' or 1=1; --");
      assert.equal(res[0].stringparam, "got ' or 1=1; --");
    });

    test('passing too few parameters fails', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      await db.fns.testdata();
      await assert.rejects(
        () => db.fns.addup(),
        err => err.code === UNDEFINED_FUNCTION);
    });

    test('passing too many parameters fails', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      await db.fns.testdata();
      await assert.rejects(
        () => db.fns.addup(13, 14),
        err => err.code === UNDEFINED_FUNCTION);
    });

    test('slow methods are aborted if statementTimeout is set', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({
        schema,
        readDbUrl: helper.dbUrl,
        writeDbUrl: helper.dbUrl,
        serviceName: 'service-1',
        statementTimeout: 100, // 0.1s
        monitor,
      });
      await assert.rejects(() => db.fns.slow(),
        err => err.code === QUERY_CANCELED);
    });

    test('read-only methods are called in read-only transactions', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      await assert.rejects(() => db.fns.readonlywrites(),
        err => err.code === READ_ONLY_SQL_TRANSACTION);
    });

    test('failing methods correctly reject', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});
      await assert.rejects(() => db.fns.fail(),
        err => err.code === '0A000');
    });

    test('do not allow service A to call any methods for service B which have mode=WRITE', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-2', monitor});

      assert.equal(versions[0].methods.testdata.serviceName, 'service-1');
      assert.equal(versions[0].methods.testdata.mode, WRITE);
      await assert.rejects(db.fns.testdata, /not allowed to call/);
      await db.close();
    });

    test('allow service A to call any methods for service A which have mode=WRITE', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});

      assert.equal(versions[0].methods.testdata.serviceName, 'service-1');
      assert.equal(versions[0].methods.testdata.mode, WRITE);
      await db.fns.testdata();
      await db.close();
    });

    test('allow service A to call any methods for service B which have mode=READ', async function() {
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor});

      assert.equal(versions[0].methods.addup.serviceName, 'service-2');
      assert.equal(versions[0].methods.addup.mode, READ);
      await db.fns.testdata();
      await db.close();
    });
  });

  test('_validUsernamePrefix', function() {
    assert(Database._validUsernamePrefix('a_b_c'));
    assert(!Database._validUsernamePrefix(''));
    assert(!Database._validUsernamePrefix('abc_123'));
    assert(!Database._validUsernamePrefix('123'));
    // this would be a particularly bizarre thing to put in the deployment configuration,
    // but hey, it won't work!
    assert(!Database._validUsernamePrefix(`'; drop table clients`));
  });

  suite('_checkTableColumns', function() {
    setup(async function() {
      db = new Database({urlsByMode: {admin: helper.dbUrl}});
      await createUsers(db);
    });

    const makeSchema = (migrationScript, tables) => {
      const versions = [{
        version: 1,
        migrationScript,
        downgradeScript: 'unused',
        methods: {},
      }];
      return Schema.fromSerializable({versions, access: {}, tables});
    };

    test('validates a simple table with integer, timestamp, and text cols', async function() {
      const schema = makeSchema(`
        begin
          create table testtable (
            quantity int,
            quality text,
            moment timestamptz
          );
        end`, {
        testtable: {
          quantity: 'integer',
          quality: 'text',
          moment: 'timestamp with time zone',
        },
      });
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = new Database({urlsByMode: {admin: helper.dbUrl}});
      await Database._checkTableColumns({db, schema});
    });

    test('fails when not null is omitted', async function() {
      const schema = makeSchema(`
        begin
          create table testtable (
            quantity int not null
          );
        end`, {
        testtable: {
          quantity: 'integer',
        },
      });
      await Database.upgrade({schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test'});
      const db = new Database({urlsByMode: {admin: helper.dbUrl}});
      await assert.rejects(
        () => Database._checkTableColumns({db, schema}),
        err => err.code === 'ERR_ASSERTION');
    });
  });

  suite('encrypt/decrypt', function() {
    const azureCryptoKey = 'aGVsbG8gZnV0dXJlIHBlcnNvbi4gaSdtIGJzdGFjawo=';
    const pgCryptoKey = 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo=';

    setup(async function() {
      db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl,
        serviceName: 'service-2', monitor, azureCryptoKey});
    });

    test('encrypt/decrypt simple', async function() {
      const encrypted = db.encrypt({value: 'hi'});
      assert.equal(encrypted.v, 0);
      assert.equal(encrypted.kid, 'azure');
      assert.equal(encrypted.__bufchunks_val, 1);
      assert(encrypted.__buf0_val !== undefined);

      // We'll just use decrypt here to assert that it was encrypted correctly otherwise
      // we'd almost be copy-pasting the decrypt code verbatim here which is kinda brittle
      const decrypted = db.decrypt({value: encrypted});
      assert.equal(decrypted.toString(), 'hi');
    });

    test('encrypt/decrypt multiple keys', async function() {
      const encrypted = db.encrypt({value: 'hi'});
      assert.equal(encrypted.v, 0);
      assert.equal(encrypted.kid, 'azure');
      assert.equal(encrypted.__bufchunks_val, 1);
      assert(encrypted.__buf0_val !== undefined);

      // This new_db does not have azureCryptoKey as it's current key but can still read old encryptions
      const new_db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl,
        serviceName: 'service-2', monitor, azureCryptoKey, cryptoKeys: [
          {id: 'foo', algo: 'aes-256', key: pgCryptoKey},
        ]});
      assert.equal(new_db.keyring.currentCryptoKey('aes-256').id, 'foo');
      const decrypted = new_db.decrypt({value: encrypted});
      assert.equal(decrypted.toString(), 'hi');

      const new_encrypted = new_db.encrypt({value: 'new hi'});
      assert.equal(new_encrypted.kid, 'foo');
      const new_decrypted = new_db.decrypt({value: new_encrypted});
      assert.equal(new_decrypted.toString(), 'new hi');

      // This db does not have the new key so it should not be able to decrypt
      assert.throws(() => {
        db.decrypt({value: new_encrypted});
      }, /Crypto key not found: `foo`/);
    });

    test('decrypt simple from lib-entities', async function() {
      const entity = Entity.types.EncryptedText('val'); // Migation scripts will hardcode this to val
      const encrypted = {v: 0, kid: 'azure'}; // Migration scripts also must add these entries
      entity.serialize(encrypted, 'abc', Buffer.from(azureCryptoKey, 'base64'));

      const decrypted = db.decrypt({value: encrypted});
      assert.equal(decrypted.toString(), 'abc');
    });

    test('decrypt multi-chunk from lib-entities', async function() {
      const entity = Entity.types.EncryptedText('val');
      const content = new Array(50000).fill(0).map((v, i) => String.fromCharCode(i % 65535)).join('');
      const encrypted = {v: 0, kid: 'azure'};
      entity.serialize(encrypted, content, Buffer.from(azureCryptoKey, 'base64'));

      // let's make sure this still tests what we mean it to even if lib-entity impl changes
      assert(encrypted.__bufchunks_val > 1);

      const decrypted = db.decrypt({value: encrypted});
      assert.equal(decrypted.toString(), content);
    });

    test('encrypt/decrypt errors without keys', async function() {
      const bad_db = await Database.setup({schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl,
        serviceName: 'service-2', monitor});
      assert.throws(() => {
        bad_db.encrypt({value: 'hi'});
      }, /no current key is configured/);

      const encrypted = db.encrypt({value: 'hi'});
      assert.throws(() => {
        bad_db.decrypt({value: encrypted});
      }, /Crypto key not found: `azure`/);
    });
  });
});
