const {dbSuite} = require('./helper');
const {Schema, Database, READ, WRITE} = require('..');
const path = require('path');
const assert = require('assert');

dbSuite(path.basename(__filename), function() {
  let db;

  const schema = new Schema({
    serviceName: 'taskcluster-lib-postgres',
    script: `
      begin
        create table testing (a integer, b integer);
      end`})
    .addMethod('testdata', READ, '', 'void', `
      begin
        insert into testing values (1, 2), (3, 4);
      end`)
    .addMethod('addup', READ, 'x integer', 'table (total integer)', `
      begin
        return query select a+b+x as total from testing;
      end`);

  setup(function() {
    db = new Database({schema, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl});
  });

  teardown(async function() {
    await db.close();
  });

  test('getVersion with no version set', async function() {
    assert.equal(await db.getVersion(), 0);
  });

  test('getVersion after set', async function() {
    await db._withClient(WRITE, async client => {
      await client.query('begin');
      await client.query(`create schema if not exists "taskcluster_lib_postgres"`);
      await client.query('create table if not exists tcversion as select 0 as version');
      await client.query('update tcversion set version = $1', [3]);
      await client.query('commit');
    });
    assert.equal(await db.getVersion(), 3);
  });

  test('_doUpgrade runs upgrade script with multiple statements', async function() {
    await db._doUpgrade(`
    begin
      create table foo as select 1 as bar;
      create table foo2 as select 2 as bar2;
    end`, 1);
    assert.equal(await db.getVersion(), 1);
    await db._withClient(READ, async client => {
      let res = await client.query('select * from foo');
      assert.deepEqual(res.rows, [{bar: 1}]);
      res = await client.query('select * from foo2');
      assert.deepEqual(res.rows, [{bar2: 2}]);
    });
  });

  test('failed _doUpgrade does not modify version', async function() {
    try {
      await db._doUpgrade(`
      begin
        create table tcversion (foo integer);
      end`, 1);
    } catch (err) {
      assert.equal(err.code, '42P07'); // duplicate table
      assert.equal(await db.getVersion(), 0);
      return;
    }
    throw new Error('_doUpgrade did not fail');
  });

  test('_defineMethod redefines a function', async function() {
    await db._withClient(WRITE, async client => {
      await client.query(`create schema if not exists "taskcluster_lib_postgres"`);
      await db._defineMethod('foo', 'name text', 'text',
        'BEGIN return concat(\'first version\'); end');
      await db._defineMethod('foo', 'name text', 'text',
        'BEGIN return concat(\'abc\', name); end');
      const res = await client.query('select * from foo(\'xyz\')');
      assert.deepEqual(res.rows, [{foo: 'abcxyz'}]);
    });
  });

  test('setup creates methods that can be called', async function() {
    await Database.upgrade(schema, {runUpgrades: true, readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl});
    const db = await Database.setup(schema, {readDbUrl: this.dbUrl, writeDbUrl: this.dbUrl});
    try {
      await db.testdata();
      const res = await db.addup(13);
      assert.deepEqual(res.map(r => r.total).sort(), [16, 20]);
    } finally {
      await db.close();
    }
  });
});
