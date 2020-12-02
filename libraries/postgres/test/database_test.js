const helper = require('./helper');
const {
  Schema,
  Database,
  READ,
  WRITE,
  DUPLICATE_OBJECT,
  QUERY_CANCELED,
  READ_ONLY_SQL_TRANSACTION,
  UNDEFINED_FUNCTION,
} = require('..');
const path = require('path');
const assert = require('assert').strict;

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
          description: 'a method that will be deprecated',
          mode: 'read',
          serviceName: 'service-2',
          args: 'x text',
          returns: 'text',
          body: `begin
            return 'got ' || x;
          end`,
        },
        sub_from_numbers_named: {
          description: 'test',
          mode: 'read',
          serviceName: 'service-2',
          args: 'a_in integer, b_in integer',
          returns: 'table (total integer)',
          body: `begin
            return query select a_in - b_in as total;
          end`,
        },
        add_from_numbers: {
          description: 'test',
          mode: 'read',
          serviceName: 'service-2',
          args: 'a integer, b integer',
          returns: 'table (total integer)',
          body: `begin
            return query select a+b as total;
          end`,
        },
      },
    }, {
      version: 2,
      methods: {
        old: {
          description: 'a method that is deprecated',
          deprecated: true,
        },
      },
    },
  ];
  const access = {};
  const tables = { testing: { a: 'integer', b: 'integer' } };
  const schema = Schema.fromSerializable({ versions, access, tables });

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

  suite('db.currentVersion', function() {
    setup(function() {
      db = new Database({ urlsByMode: { [READ]: helper.dbUrl, [WRITE]: helper.dbUrl } });
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

  suite('Database._checkPermissions', function() {
    let db;

    suiteSetup(async function() {
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
    });

    suiteTeardown(async function() {
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await resetRoles(db);
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

    const withAccess = access => Schema.fromSerializable({ access, tables: {}, versions: [] });

    test('empty access.yml', async function() {
      const schema = withAccess({ service1: { tables: {} }, service2: { tables: {} } });
      await Database._checkPermissions({ db, schema, usernamePrefix: 'test' });
      // does not fail
    });

    test('permissions missing', async function() {
      const schema = withAccess({
        service1: { tables: { foo: 'read' } },
        service2: { tables: { foo: 'write' } },
      });
      await assert.rejects(() => Database._checkPermissions({ db, schema, usernamePrefix: 'test' }),
        /missing database user grant: test_service1: SELECT on foo/);
    });

    test('extra permissions', async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
        await client.query('grant select on bar to test_service2');
      });
      const schema = withAccess({
        service1: { tables: { foo: 'read' } },
        service2: { tables: { foo: 'write' } },
      });
      await assert.rejects(() => Database._checkPermissions({ db, schema, usernamePrefix: 'test' }),
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
        service1: { tables: { foo: 'read' } },
        service2: { tables: { foo: 'write' } },
      });
      await assert.rejects(() => Database._checkPermissions({ db, schema, usernamePrefix: 'test' }),
        /unexpected database user grant: test_service2: SELECT on bar/);
    });

    test('correct permissions', async function() {
      await db._withClient('admin', async client => {
        await client.query('grant select on foo to test_service1');
        await client.query('grant select, insert, update, delete on foo to test_service2');
      });
      const schema = withAccess({
        service1: { tables: { foo: 'read' } },
        service2: { tables: { foo: 'write' } },
      });
      await Database._checkPermissions({ db, schema, usernamePrefix: 'test' });
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
          service1: { tables: { foo: 'read' } },
          service2: { tables: { foo: 'write' } },
        });
        await assert.rejects(() => Database._checkPermissions({ db, schema, usernamePrefix: 'test' }),
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
        service1: { tables: { foo: 'read' } },
        service2: { tables: { foo: 'write' } },
      });
      await assert.rejects(() => Database._checkPermissions({ db, schema, usernamePrefix: 'test' }),
        new RegExp(`test_service2 has unexpected role badrole`));
    });
  });

  suite('Database.setup', function() {
    test('setup creates JS methods that can be called', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      await db.fns.testdata();
      const res = await db.fns.addup(13);
      assert.deepEqual(res.map(r => r.total).sort(), [16, 20]);
    });

    test('setup moves deprecated methods to deprecatedFns', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      assert(!db.fns.old);
      assert(db.deprecatedFns.old);
      assert.equal((await db.deprecatedFns.old('hi'))[0].old, 'got hi');
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
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      assert(db.keyring);
    });

    test('methods do not allow SQL injection', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      await db.fns.testdata();
      const res = await db.fns.stringparam("' or 1=1; --");
      assert.equal(res[0].stringparam, "got ' or 1=1; --");
    });

    test('passing too few parameters fails', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      await db.fns.testdata();
      await assert.rejects(
        () => db.fns.addup(),
        err => err.code === UNDEFINED_FUNCTION);
    });

    test('passing too many parameters fails', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      await db.fns.testdata();
      await assert.rejects(
        () => db.fns.addup(13, 14),
        err => err.code === UNDEFINED_FUNCTION);
    });

    test('slow methods are aborted if statementTimeout is set', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
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
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      await assert.rejects(() => db.fns.readonlywrites(),
        err => err.code === READ_ONLY_SQL_TRANSACTION);
    });

    test('failing methods correctly reject', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      await assert.rejects(() => db.fns.fail(),
        err => err.code === '0A000');
    });

    test('do not allow service A to call any methods for service B which have mode=WRITE', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      const db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-2', monitor });

      assert.equal(versions[0].methods.testdata.serviceName, 'service-1');
      assert.equal(versions[0].methods.testdata.mode, WRITE);
      await assert.rejects(db.fns.testdata, /not allowed to call/);
      await db.close();
    });

    test('allow service A to call any methods for service A which have mode=WRITE', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      const db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });

      assert.equal(versions[0].methods.testdata.serviceName, 'service-1');
      assert.equal(versions[0].methods.testdata.mode, WRITE);
      await db.fns.testdata();
      await db.close();
    });

    test('allow service A to call any methods for service B which have mode=READ', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      const db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });

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
      db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await createUsers(db);
    });

    const makeSchema = (migrationScript, tables) => {
      const versions = [{
        version: 1,
        migrationScript,
        downgradeScript: 'unused',
        methods: {},
      }];
      return Schema.fromSerializable({ versions, access: {}, tables });
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
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      const db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await Database._checkTableColumns({ db, schema });
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
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test', skipChecks: true });
      const db = new Database({ urlsByMode: { admin: helper.dbUrl } });
      await assert.rejects(
        () => Database._checkTableColumns({ db, schema }),
        err => err.code === 'ERR_ASSERTION');
    });
  });

  suite('encrypt/decrypt', function() {
    const azureCryptoKey = 'aGVsbG8gZnV0dXJlIHBlcnNvbi4gaSdtIGJzdGFjawo=';
    const pgCryptoKey = 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo=';

    setup(async function() {
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl,
        serviceName: 'service-2', monitor, azureCryptoKey });
    });

    test('encrypt/decrypt simple', async function() {
      const encrypted = db.encrypt({ value: Buffer.from('hi') });
      assert.equal(encrypted.v, 0);
      assert.equal(encrypted.kid, 'azure');
      assert.equal(encrypted.__bufchunks_val, 1);
      assert(encrypted.__buf0_val !== undefined);

      // We'll just use decrypt here to assert that it was encrypted correctly otherwise
      // we'd almost be copy-pasting the decrypt code verbatim here which is kinda brittle
      const decrypted = db.decrypt({ value: encrypted });
      assert.equal(decrypted.toString(), 'hi');
    });

    test('encrypt/decrypt multiple keys', async function() {
      const encrypted = db.encrypt({ value: Buffer.from('hi') });
      assert.equal(encrypted.v, 0);
      assert.equal(encrypted.kid, 'azure');
      assert.equal(encrypted.__bufchunks_val, 1);
      assert(encrypted.__buf0_val !== undefined);

      // This new_db does not have azureCryptoKey as it's current key but can still read old encryptions
      const new_db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl,
        serviceName: 'service-2', monitor, azureCryptoKey, dbCryptoKeys: [
          { id: 'foo', algo: 'aes-256', key: pgCryptoKey },
        ] });
      assert.equal(new_db.keyring.currentCryptoKey('aes-256').id, 'foo');
      const decrypted = new_db.decrypt({ value: encrypted });
      assert.equal(decrypted.toString(), 'hi');

      const new_encrypted = new_db.encrypt({ value: Buffer.from('new hi') });
      assert.equal(new_encrypted.kid, 'foo');
      const new_decrypted = new_db.decrypt({ value: new_encrypted });
      assert.equal(new_decrypted.toString(), 'new hi');

      // This db does not have the new key so it should not be able to decrypt
      assert.throws(() => {
        db.decrypt({ value: new_encrypted });
      }, /Crypto key not found: `foo`/);
    });

    test('decrypt simple from lib-entities', async function() {
      // generated with:
      //   const entity = Entity.types.EncryptedText('val');
      //   const encrypted = {v: 0, kid: 'azure'};
      //   entity.serialize(encrypted, 'abc', Buffer.from(azureCryptoKey, 'base64'));
      const encrypted = {
        v: 0,
        kid: 'azure',
        __buf0_val: '+/EDVGcXi/ASKeFCmbBbduzCkRTmTUFh4g1iVN8Eia4=',
        __bufchunks_val: 1,
      };

      const decrypted = db.decrypt({ value: encrypted });
      assert.equal(decrypted.toString(), 'abc');
    });

    test('decrypt multi-chunk from lib-entities', async function() {
      const content = new Array(50000).fill(0).map((v, i) => String.fromCharCode(i % 65535)).join('');

      // generated with:
      //  const entity = Entity.types.EncryptedText('val');
      //  const encrypted = {v: 0, kid: 'azure'};
      //  entity.serialize(encrypted, content, Buffer.from(azureCryptoKey, 'base64'));
      const encrypted = require('./big-encrypted-value.json');

      // let's make sure this still tests what we mean it to even if lib-entity impl changes
      assert(encrypted.__bufchunks_val > 1);

      const decrypted = db.decrypt({ value: encrypted });
      assert.equal(decrypted.toString(), content);
    });

    test('encrypt/decrypt errors without keys', async function() {
      const bad_db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl,
        serviceName: 'service-2', monitor });
      assert.throws(() => {
        bad_db.encrypt({ value: Buffer.from('hi') });
      }, /no current key is configured/);

      const encrypted = db.encrypt({ value: Buffer.from('hi') });
      assert.throws(() => {
        bad_db.decrypt({ value: encrypted });
      }, /Crypto key not found: `azure`/);
    });

    test('encrypt errors for non-buffers', async function() {
      assert.throws(() => {
        db.encrypt({ value: 'i am just a string' });
      }, /Encrypted values must be Buffers/);
    });
  });

  suite('named arguments', async function () {
    test('subtract two numbers', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });

      let res = await db.fns.sub_from_numbers_named({ a_in: 5, b_in: 2 });
      assert.equal(res[0].total, 3);

      // check in the opposite order
      res = await db.fns.sub_from_numbers_named({ b_in: 2, a_in: 5 });
      assert.equal(res[0].total, 3);
    });

    test('throws when arguments do not end with "_in"', async function() {
      await Database.upgrade({ schema, adminDbUrl: helper.dbUrl, usernamePrefix: 'test' });
      db = await Database.setup({ schema, readDbUrl: helper.dbUrl, writeDbUrl: helper.dbUrl, serviceName: 'service-1', monitor });
      await assert.rejects(
        async () => {
          await db.fns.add_from_numbers({ a: 1, b: 2 });
        },
        err => err.code === UNDEFINED_FUNCTION,
      );
    });
  });
});
