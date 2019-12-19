const assert = require('assert');
const {Client} = require('pg');
const {Schema, WRITE} = require('taskcluster-lib-postgres');
const tcdb = require('taskcluster-db');

exports.dbUrl = process.env.TEST_DB_URL;
assert(exports.dbUrl, "TEST_DB_URL must be set to run db/ tests");

exports.schema = Schema.fromDbDirectory();

/**
 * Set
 * - helper.db to an empty database instance, using the schema from the repo.
 * - helper.withDbClient(fn) to call fn with a pg client.
 * - helper.upgradeDb() to upgrade to the given version (or latest version if omitted)
 *
 * The database is only reset at the beginning of the suite.  Test suites
 * should implement a `setup` method that sets state for all relevant tables
 * before each test case.
 *
 * Pass serviceName when testing methods for a specific service.  If omitted,
 * it will be set to `dummy` and `helper.db.procs` will probably not do what
 * you want.
 */
exports.withDb = function({ serviceName = "dummy" } = {}) {
  suiteSetup('setup database', async function() {
    await exports.clearDb();

    exports.db = await tcdb.setup({
      writeDbUrl: exports.dbUrl,
      readDbUrl: exports.dbUrl,
      serviceName,
    });

    exports.fakeDb = await tcdb.fakeSetup({
      serviceName,
    });

    exports.upgradeDb = async (toVersion) => {
      await tcdb.upgrade({
        adminDbUrl: exports.dbUrl,
        toVersion,
      });
    };

    exports.withDbClient = fn => exports.db._withClient(WRITE, fn);
  });

  suiteTeardown('teardown database', async function() {
    await exports.db.close();
    delete exports.db;
  });
};

/**
 * helper.dbTest("description", async (db, isFake) => { .. }) runs the given
 * test function both with a real and fake db.
 */
exports.dbTest = (description, testFn) => {
  test(`${description} (real)`, async function() {
    return testFn(exports.db, false);
  });
  test(`${description} (fake)`, async function() {
    return testFn(exports.fakeDb, true);
  });
};

/**
 * Clear the database, resetting it to its initial, empty state
 */
exports.clearDb = async () => {
  const client = new Client({connectionString: exports.dbUrl});
  await client.connect();
  try {
    await client.query(`drop schema if exists public cascade`);
    await client.query(`create schema public`);
  } finally {
    client.end();
  }
};
