const {dbSuite} = require('./helper');
const {Schema, Database, READ, WRITE} = require('..');
const path = require('path');
const assert = require('assert');

dbSuite(path.basename(__filename), function() {
  let db;

  const versions = [
    {
      version: 1,
      migrationScript: `begin
        create table testing (a integer, b integer);
      end`,
      methods: {
        testdata: {
          mode: 'write',
          serviceName: 'service-1',
          args: '',
          returns: 'void',
          body: `begin
            insert into testing values (1, 2), (3, 4);
          end`,
        },
        addup: {
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
  const schema = Schema.fromSerializable({versions});

  setup(function() {
    db = new Database({schema, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl, serviceName: 'service-1'});
  });

  teardown(async function() {
    await db.close();
  });

  test('currentVersion with no version set', async function() {
    assert.equal(await db.currentVersion(), 0);
  });

  test('currentVersion after set', async function() {
    await db._withClient(WRITE, async client => {
      await client.query('begin');
      await client.query(`create schema if not exists "taskcluster_lib_postgres"`);
      await client.query('create table if not exists tcversion as select 0 as version');
      await client.query('update tcversion set version = $1', [3]);
      await client.query('commit');
    });
    assert.equal(await db.currentVersion(), 3);
  });

  test('_doUpgrade runs upgrade script with multiple statements', async function() {
    await db._doUpgrade({
      version: 1,
      migrationScript: `begin
        create table foo as select 1 as bar;
        create table foo2 as select 2 as bar2;
      end`,
      methods: {},
    }, () => {});
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
        version: 1,
        migrationScript: `begin
          select nosuchcolumn from tcversion;
        end`,
        methods: {},
      }, () => {});
    } catch (err) {
      assert.equal(err.code, '42703'); // unknown column
      assert.equal(await db.currentVersion(), 0);
      return;
    }
    throw new Error('_doUpgrade did not fail');
  });

  test('setup creates JS methods that can be called', async function() {
    await Database.upgrade({schema, runUpgrades: true, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl, serviceName: 'service-1'});
    await db.procs.testdata();
    const res = await db.procs.addup(13);
    assert.deepEqual(res.map(r => r.total).sort(), [16, 20]);
  });

  test('procedure methods does not have capital letters', async function () {
    const schema = Schema.fromSerializable({
      versions: [{
        version: 1,
        migrationScript: `begin
          create table testing (a integer, b integer);
        end`,
        methods: {
          testData: {
            mode: 'write',
            args: '',
            returns: 'void',
            body: `begin
              insert into testing values (1, 2), (3, 4);
            end`,
          },
        },
      }],
    });

    await assert.rejects(
      Database.upgrade({schema, runUpgrades: true, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrli, serviceName: 'service-1'}),
      /capital letters/,
    );
  });

  test('do not allow service A to call any methods for service B which have mode=WRITE', async function() {
    await Database.upgrade({schema, runUpgrades: true, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl, serviceName: 'service-2'});
    const db = await Database.setup({schema, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl, serviceName: 'service-2'});

    assert.equals(versions.methods.testdata.schemaName, 'service-1');
    assert.equals(versions.methods.testdata.mode, WRITE);
    await assert.rejects(db.procs.testdata());
    await db.close();
  });

  test('allow service A to call any methods for service B which have mode=READ', async function() {
    await Database.upgrade({schema, runUpgrades: true, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl, serviceName: 'service-1'});
    const db = await Database.setup({schema, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl, serviceName: 'service-1'});

    assert.equals(versions.methods.addup.schemaName, 'service-2');
    assert.equals(versions.methods.addup.mode, READ);
    await db.procs.testdata();
    await db.close();
  });

  test('procedure methods does not have capital letters', async function () {
    const schema = Schema.fromSerializable({
      versions: [{
        version: 1,
        migrationScript: `begin
            create table testing (a integer, b integer);
          end`,
        methods: {
          testData: {
            mode: 'write',
            args: '',
            returns: 'void',
            body: `begin
              insert into testing values (1, 2), (3, 4);
            end`,
          },
        },
      }],
    });

    await Database.upgrade({schema, runUpgrades: true, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrli, serviceName: 'service-1'});

    try {
      await Database.setup({schema, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl, serviceName: 'service-1'});
      assert.fail('should have failed');
    } catch (e) {
      assert(e);
    }
    finally {
      await db.close();
    }
  });
});
