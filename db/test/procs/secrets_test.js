const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'secrets' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from secrets');
      await client.query(`
        insert into secrets(name, secret, expires) values
          ('my-secret', 'hunter2', '2019-01-01'),
          ('their-secret', 'hunter3', '2019-01-01')
      `);
    });
    helper.fakeDb.secrets.reset();
    helper.fakeDb.secrets.addSecret("my-secret", "hunter2", new Date(2019, 0, 1));
    helper.fakeDb.secrets.addSecret("their-secret", "hunter3", new Date(2019, 0, 1));
  });

  helper.dbTest('get_secret', async function(db, isFake) {
    const sec = await db.procs.get_secret("my-secret");
    assert.deepEqual(sec, [{secret: 'hunter2'}]);
  });

  helper.dbTest('get_secret no such secret', async function(db, isFake) {
    const sec = await db.procs.get_secret("nosuch-secret");
    assert.deepEqual(sec, []);
  });

  helper.dbTest('get_secret_with_expires', async function(db, isFake) {
    const sec = await db.procs.get_secret_with_expires("my-secret");
    assert.deepEqual(sec, [{secret: 'hunter2', expires: new Date(2019, 0, 1)}]);
  });

  helper.dbTest('get_secret_with_expires no such secret', async function(db, isFake) {
    const sec = await db.procs.get_secret_with_expires("nosuch-secret");
    assert.deepEqual(sec, []);
  });

  helper.dbTest('list_secrets', async function(db, isFake) {
    const secs = await db.procs.list_secrets();
    assert.deepEqual(
      secs.sort(),
      [{name: 'my-secret'}, {name: 'their-secret'}].sort());
  });

  helper.dbTest('list_secrets_with_expires', async function(db, isFake) {
    const secs = await db.procs.list_secrets_with_expires();
    assert.deepEqual(
      secs.sort(), [
        {name: 'my-secret', expires: new Date(2019, 0, 1)},
        {name: 'their-secret', expires: new Date(2019, 0, 1)},
      ].sort());
  });

  helper.dbTest('remove_secret', async function(db, isFake) {
    await db.procs.remove_secret('my-secret');
    const secs = await db.procs.list_secrets();
    assert.deepEqual(secs, [{name: 'their-secret'}]);
  });

  helper.dbTest('remove_secret no such secret', async function(db, isFake) {
    await db.procs.remove_secret('nosuch-secret');
    const secs = await db.procs.list_secrets();
    assert.deepEqual(
      secs.sort(),
      [{name: 'my-secret'}, {name: 'their-secret'}].sort());
  });

  // TODO: set secret
});
