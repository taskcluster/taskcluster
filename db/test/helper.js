const assert = require('assert');
const {Client} = require('pg');
const {Schema, Database, WRITE} = require('taskcluster-lib-postgres');

exports.dbUrl = process.env.TEST_DB_URL;
assert(exports.dbUrl, "TEST_DB_URL must be set to run db/ tests");

exports.schema = Schema.fromDbDirectory();

/**
 * Set helper.db to an empty database instance, using the schema from the repo.
 * Also sets up helper.withDbClient(fn) to call fn with a pg client.
 * Also sets up helper.upgradeTo(ver) to upgrade the DB to a specific
 * version.
 *
 * The database is only reset at the beginning of the suite.  Test suites
 * should implement a `setup` method that sets state for all relevant tables
 * before each test case.
 */
exports.withDb = function() {
  suiteSetup('setup database', async function() {
    await exports.clearDb();
    exports.db = await Database.setup({
      schema: exports.schema,
      writeDbUrl: exports.dbUrl,
      readDbUrl: exports.dbUrl,
    });

    exports.upgradeTo = async ver => {
      await Database.upgrade({
        schema: exports.schema,
        toVersion: ver,
        writeDbUrl: exports.dbUrl,
        readDbUrl: exports.dbUrl,
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
