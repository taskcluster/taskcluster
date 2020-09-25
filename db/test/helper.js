const assert = require('assert');
const { Pool } = require('pg');
const { WRITE } = require('taskcluster-lib-postgres');
const { resetDb } = require('taskcluster-lib-testing');
const tcdb = require('taskcluster-db');
const debug = require('debug')('db-helper');
const { UNDEFINED_TABLE, UNDEFINED_COLUMN } = require('taskcluster-lib-postgres');

exports.dbUrl = process.env.TEST_DB_URL;
assert(exports.dbUrl, "TEST_DB_URL must be set to run db/ tests - see dev-docs/development-process.md for more information");

/**
 * Set up to test a DB version.
 *
 * Set
 * - helper.withDbClient(fn) to call fn with a pg client.
 * - helper.upgradeTo(v) to upgrade to the given version.
 * - helper.downgradeTo(v) to downgrade to the given version.
 * - helper.toDbVersion(v) to upgrade or downgrade as necessary to the given version
 * - helper.setupDb(serviceName) returns a setup Database object for that service
 *
 * The database is only reset at the beginning of the suite.  Test suites
 * should implement a `setup` method that sets state for all relevant tables
 * before each test case.
 */
exports.withDbForVersion = function() {
  let pool;
  let dbs = {};

  suiteSetup('setup database', async function() {
    pool = new Pool({ connectionString: exports.dbUrl });
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

    exports.setupDb = async serviceName => {
      if (dbs[serviceName]) {
        return dbs[serviceName];
      }
      const db = await tcdb.setup({
        writeDbUrl: exports.dbUrl,
        readDbUrl: exports.dbUrl,
        serviceName,
        useDbDirectory: true,
        monitor: false,
        dbCryptoKeys: [
          {
            id: 'azure',
            algo: 'aes-256',
            // only used for tests
            key: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
          },
        ],
      });
      dbs[serviceName] = db;
      return db;
    };

    exports.upgradeTo = async (toVersion) => {
      await tcdb.upgrade({
        adminDbUrl: exports.dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
      });
    };

    exports.downgradeTo = async (toVersion) => {
      await tcdb.downgrade({
        adminDbUrl: exports.dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
      });
    };

    exports.toDbVersion = async (toVersion) => {
      await tcdb.upgrade({
        adminDbUrl: exports.dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
      });

      await tcdb.downgrade({
        adminDbUrl: exports.dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
      });
    };

    await resetDb({ testDbUrl: exports.dbUrl });
  });

  suiteTeardown('teardown database', async function() {
    if (pool) {
      await pool.end();
    }
    pool = null;
    for (let db of Object.values(dbs)) {
      await db.close();
    }
    dbs = {};

    delete exports.upgradeDb;
    delete exports.withDbClient;
    delete exports.getDb;
  });
};

/**
 * Set
 * - helper.withDbClient(fn) to call fn with a pg client on the real DB.
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
      monitor: false,
      dbCryptoKeys: [
        {
          id: 'azure',
          algo: 'aes-256',
          // only used for tests
          key: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
        },
      ],
    });

    exports.withDbClient = fn => db._withClient(WRITE, fn);

    // clear the DB and upgrade it to the latest version
    await resetDb({ testDbUrl: exports.dbUrl });
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
    delete exports.withDbClient;
  });

  /**
   * helper.dbTest("description", async (db) => { .. }) runs the given
   * test function both with a real and fake db.  This is used for testing functions.
   */
  exports.dbTest = (description, testFn) => {
    test(description, async function() {
      return testFn(db);
    });
  };
};

/**
 * Assert that the given table exists and is empty (used to test table creation
 * in versions)
 */
exports.assertTable = async name => {
  await exports.withDbClient(async client => {
    const res = await client.query(`select * from ${name}`);
    assert.deepEqual(res.rows, []);
  });
};

/**
 * Assert that the given column exists.
 */
exports.assertTableColumn = async (table, column) => {
  await exports.withDbClient(async client => {
    await client.query(`select ${column} from ${table}`);
  });
};

/**
 * Assert that the given table does not exist (used to test table deletion in
 * downgrade scripts).
 */
exports.assertNoTable = async name => {
  await exports.withDbClient(async client => {
    await assert.rejects(() => client.query(`select * from ${name}`), err => err.code === UNDEFINED_TABLE);
  });
};

/**
 * Assert that the given column does not exist.
 */
exports.assertNoTableColumn = async (table, column) => {
  await exports.withDbClient(async client => {
    await assert.rejects(
      () => client.query(`select ${column} from ${table}`),
      err => err.code === UNDEFINED_COLUMN);
  });
};
