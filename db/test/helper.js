const assert = require('assert');
const {Pool} = require('pg');
const {WRITE} = require('taskcluster-lib-postgres');
const {resetDb} = require('taskcluster-lib-testing');
const tcdb = require('taskcluster-db');
const debug = require('debug')('db-helper');

exports.dbUrl = process.env.TEST_DB_URL;
assert(exports.dbUrl, "TEST_DB_URL must be set to run db/ tests");

/**
 * Set up to test a DB version.
 *
 * Set
 * - helper.withDbClient(fn) to call fn with a pg client.
 * - helper.upgradeTo(v) to upgrade to the given version.
 *
 * The database is only reset at the beginning of the suite.  Test suites
 * should implement a `setup` method that sets state for all relevant tables
 * before each test case.
 */
exports.withDbForVersion = function() {
  let pool;

  suiteSetup('setup database', async function() {
    pool = new Pool({connectionString: exports.dbUrl});
    exports.withDbClient = async (cb) => {
      const client = await pool.connect();
      try {
        try {
          return await cb(client);
        } catch (err) {
          // show hints or details from this error in the debug log, to help
          // debugging issues..
          if (err.hint) {
            debug(`HINT: ${err.hint}`);
          }
          if (err.detail) {
            debug(`DETAIL: ${err.detail}`);
          }
          throw err;
        }
      } finally {
        client.release();
      }
    };

    exports.upgradeTo = async (toVersion) => {
      await tcdb.upgrade({
        adminDbUrl: exports.dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
      });
    };

    await resetDb({testDbUrl: exports.dbUrl});
  });

  suiteTeardown('teardown database', async function() {
    if (pool) {
      await pool.end();
    }
    pool = null;
    delete exports.upgradeDb;
    delete exports.withDbClient;
  });
};

/**
 * Set
 * - helper.withDbClient(fn) to call fn with a pg client on the real DB.
 * - helper.fakeDb to an instance of FakeDatabase
 *
 * The database is only reset at the beginning of the suite.  Test suites
 * should implement a `setup` method that sets state for all relevant tables
 * before each test case.
 */
exports.withDbForProcs = function({ serviceName }) {
  let db;
  suiteSetup('setup database', async function() {
    db = await tcdb.setup({
      writeDbUrl: exports.dbUrl,
      readDbUrl: exports.dbUrl,
      serviceName,
      useDbDirectory: true,
    });

    exports.fakeDb = await tcdb.fakeSetup({
      serviceName,
    });

    exports.withDbClient = fn => db._withClient(WRITE, fn);

    // clear the DB and upgrade it to the latest version
    await resetDb({testDbUrl: exports.dbUrl});
    await tcdb.upgrade({
      adminDbUrl: exports.dbUrl,
      usernamePrefix: 'test',
      useDbDirectory: true,
    });
  });

  suiteTeardown('teardown database', async function() {
    if (db) {
      await db.close();
    }
    db = null;
    delete exports.fakeDb;
    delete exports.withDbClient;
  });

  /**
   * helper.dbTest("description", async (db, isFake) => { .. }) runs the given
   * test function both with a real and fake db.  This is used for testing functions.
   */
  exports.dbTest = (description, testFn) => {
    test(`${description} (real)`, async function() {
      return testFn(db, false);
    });
    test(`${description} (fake)`, async function() {
      return testFn(exports.fakeDb, true);
    });
  };
};
