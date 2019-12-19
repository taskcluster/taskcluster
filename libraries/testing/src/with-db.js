const {WRITE} = require('taskcluster-lib-postgres');
const tcdb = require('taskcluster-db');

/**
 * withDb:
 *
 * - in mock mode, set up helper.db as a FakeDatabase
 * - in real mode, set up helper.db as a real Database, and upgrade that
 *   database to the most recent version.
 *
 * In either case, it's up to the caller to set up and clear any data
 * between test cases.
 */
module.exports = (mock, skipping, helper, serviceName) => {
  // on suite setup, monkey-patch the `setup` method of each class to do what
  // we promise; then un-patch it on teardown
  suiteSetup('withDb', async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      helper.db = await tcdb.fakeSetup({serviceName});
    } else {
      const sec = helper.secrets.get('db');
      helper.db = await tcdb.setup({
        readDbUrl: sec.testDbUrl,
        writeDbUrl: sec.testDbUrl,
        serviceName,
      });

      // completely reset the DB
      await helper.db._withClient(WRITE, async client => {
        await client.query(`drop schema if exists public cascade`);
        await client.query(`create schema public`);
      });

      // upgrade..
      await tcdb.upgrade({adminDbUrl: sec.testDbUrl});
    }

    helper.load.inject('db', helper.db);
  });

  suiteTeardown('withDb', async function() {
    if (skipping()) {
      return;
    }
    await helper.db.close();
    delete helper.db;
  });
};

module.exports.secret = [
  {env: 'TEST_DB_URL', cfg: 'db.testUrl', name: 'testDbUrl'},
];
