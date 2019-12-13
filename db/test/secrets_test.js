const assert = require('assert').strict;
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDb();

  suiteSetup('set up latest version', async function() {
    await helper.upgradeDb();
  });

  setup('clear table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from secrets');
      await client.query(`
        insert into secrets(name, secret, expires) values
          ('my-secret', 'hunter2', '2019-01-01'),
          ('their-secret', 'hunter3', '2019-01-01')
      `);
    });
  });

  test('get_secret', async function() {
    const sec = await helper.db.procs.get_secret("my-secret");
    assert.deepEqual(sec, [{secret: 'hunter2'}]);
  });

  test('get_secret no such secret', async function() {
    await helper.withDbClient(async client => {
      await client.query(`
        delete from secrets where name='my-secret'
      `);
    });

    const sec = await helper.db.procs.get_secret("my-secret");
    assert.deepEqual(sec, []);
  });

  test('list_secrets', async function() {
    const secs = await helper.db.procs.list_secrets();
    assert.deepEqual(
      secs.sort(),
      [{name: 'my-secret'}, {name: 'their-secret'}].sort());
  });

  test('remove_secret', async function() {
    await helper.db.procs.remove_secret('my-secret');
    const secs = await helper.db.procs.list_secrets();
    assert.deepEqual(secs, [{name: 'their-secret'}]);
  });

  test('remove_secret no such secret', async function() {
    await helper.db.procs.remove_secret('nosuch-secret');
    const secs = await helper.db.procs.list_secrets();
    assert.deepEqual(
      secs.sort(),
      [{name: 'my-secret'}, {name: 'their-secret'}].sort());
  });

  // TODO: set secret
});
