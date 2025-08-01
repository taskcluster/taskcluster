import assert from 'assert';
import Debug from 'debug';
import pg from 'pg';
const { Pool } = pg;
import { WRITE } from '@taskcluster/lib-postgres';
import { resetDb } from '@taskcluster/lib-testing';
import tcdb from '@taskcluster/db';
import debugFactory from 'debug';
const debug = debugFactory('db-helper');
import { UNDEFINED_TABLE, UNDEFINED_COLUMN, runOnlineBatches } from '@taskcluster/lib-postgres';

export const dbUrl = process.env.TEST_DB_URL;
assert(dbUrl, "TEST_DB_URL must be set to run db/ tests - see dev-docs/development-process.md for more information");

// helper will be dynamically populated by withDbForVersion and withDbForProcs methods
const helper = { dbUrl, resetDb };

export default helper;

/**
 * Set up to test a DB version.
 *
 * Exposes
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
helper.withDbForVersion = function() {
  let pool;
  let dbs = {};

  const showProgress = Debug('showProgress');

  suiteSetup('setup database', async function() {
    pool = new Pool({ connectionString: dbUrl });

    helper.withDbClient = async (cb) => {
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

    helper.setupDb = async serviceName => {
      if (dbs[serviceName]) {
        return dbs[serviceName];
      }
      const db = await tcdb.setup({
        writeDbUrl: dbUrl,
        readDbUrl: dbUrl,
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

    helper.upgradeTo = async (toVersion) => {
      await tcdb.upgrade({
        adminDbUrl: dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
        showProgress,
      });
    };

    helper.downgradeTo = async (toVersion) => {
      await tcdb.downgrade({
        adminDbUrl: dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
        showProgress,
      });
    };

    helper.toDbVersion = async (toVersion) => {
      await tcdb.upgrade({
        adminDbUrl: dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
        showProgress,
      });

      await tcdb.downgrade({
        adminDbUrl: dbUrl,
        toVersion,
        usernamePrefix: 'test',
        useDbDirectory: true,
        showProgress,
      });
    };

    await resetDb({ testDbUrl: dbUrl });
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

    delete helper.upgradeDb;
    delete helper.withDbClient;
    delete helper.getDb;
  });
};

/**
 * Exposes
 * - helper.withDbClient(fn) to call fn with a pg client on the real DB.
 *
 * The database is only reset at the beginning of the suite.  Test suites
 * should implement a `setup` method that sets state for all relevant tables
 * before each test case.
 */
helper.withDbForProcs = function({ serviceName }) {
  let db;
  suiteSetup('setup database', async function() {
    db = await tcdb.setup({
      writeDbUrl: dbUrl,
      readDbUrl: dbUrl,
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

    helper.withDbClient = fn => db._withClient(WRITE, fn);

    // clear the DB and upgrade it to the latest version
    await resetDb({ testDbUrl: dbUrl });
    await tcdb.upgrade({
      adminDbUrl: dbUrl,
      usernamePrefix: 'test',
      useDbDirectory: true,
    });
  });

  suiteTeardown('teardown database', async function() {
    if (db) {
      await db.close();
    }
    db = null;
    delete helper.withDbClient;
  });

  /**
   * helper.dbTest("description", async (db) => { .. }) runs the given
   * test function both with a real and fake db.  This is used for testing functions.
   */
  helper.dbTest = (description, testFn) => {
    test(description, async function() {
      return testFn(db);
    });
  };
};

/**
 * Assert that the given table exists and is empty (used to test table creation
 * in versions)
 */
helper.assertTable = async name => {
  await helper.withDbClient(async client => {
    const res = await client.query(`select * from ${name}`);
    assert.deepEqual(res.rows, []);
  });
};

/**
 * Assert that the given column exists.
 */
helper.assertTableColumn = async (table, column) => {
  await helper.withDbClient(async client => {
    await client.query(`select ${column} from ${table}`);
  });
};

/**
 * Assert that the given table does not exist (used to test table deletion in
 * downgrade scripts).
 */
helper.assertNoTable = async name => {
  await helper.withDbClient(async client => {
    await assert.rejects(() => client.query(`select * from ${name}`), err => err.code === UNDEFINED_TABLE);
  });
};

/**
 * Assert that the given column does not exist.
 */
helper.assertNoTableColumn = async (table, column) => {
  await helper.withDbClient(async client => {
    await assert.rejects(
      () => client.query(`select ${column} from ${table}`),
      err => err.code === UNDEFINED_COLUMN);
  });
};

const queryIndexInfo = async (client, table, index, column) =>
  client.query(`SELECT
    t.relname AS table,
    i.relname AS index,
    a.attname AS column
    FROM
      pg_class t,
      pg_class i,
      pg_index ix,
      pg_attribute a
    WHERE
      t.oid = ix.indrelid
      AND i.oid = ix.indexrelid
      AND a.attrelid = t.oid
      AND a.attnum = ANY (ix.indkey)
      AND t.relkind = 'r'
      AND t.relname = '${table}'
      AND i.relname = '${index}'
      AND a.attname = '${column}'`);

/**
 * Assert that the table contains given index on specific column
 */
helper.assertIndexOnColumn = async (table, index, column) => {
  await helper.withDbClient(async client => {
    const res = await queryIndexInfo(client, table, index, column);
    assert.deepEqual(res.rows, [{ table, index, column }]);
  });
};

/**
 * Assert that the table doesn't contain given index on a column
 */
helper.assertNoIndexOnColumn = async (table, index, column) => {
  await helper.withDbClient(async client => {
    const res = await queryIndexInfo(client, table, index, column);
    assert.deepEqual(res.rows, []);
  });
};

/**
 * Test a version's migration and downgrade support.
 *
 * This creates a suite of tests to try various scenarios, especially with online
 * migrations and downgrades.
 *
 * The createData function should create enough data that an online migration can
 * run several batches -- usually about 100 items.
 *
 * The `startCheck` function should check that the schema matches expectations of
 * the previous version (tables, columns, etc.) and that the created data is in
 * place.
 *
 * Similarly `finishedCheck` should check that the schema changes in this
 * version have been made, and that all data has been properly migrated.
 *
 * The concurrentCheck function is called at several points during the
 * migration/downgrade and should call stored DB functions to ensure that they
 * do not malfunction during the process.  This function is called at the start
 * and finish, too, so there is no need to duplicate its checks in startCheck
 * or finishedCheck.
 */
helper.dbVersionTest = ({
  // the version being tested
  version,
  // true if there's an online migration / downgrade
  onlineMigration, onlineDowngrade,
  // function (taking a client) to create data at the *previous* version
  createData,
  // function (taking a client) to check state at the previous version
  startCheck,
  // function (taking a client) to check behavior that should always work
  concurrentCheck,
  // function (taking a client) to check behavior that should work when the upgrade is complete
  finishedCheck,
}) => {
  const THIS_VERSION = version;
  const PREV_VERSION = version - 1;
  const debug = Debug('dbVersionTest');
  let sawMigrationBatches, sawDowngradeBatches;

  // an error to signal that an upgrade or downgrade process should be smoothly
  // aborted
  const abort = new Error('ABORT!');
  abort.code = 'ABORT!';

  // call the given function (upgradeTo or downgradeTo) after installing a bunch
  // of hooks to call checkpoint functions as the function progresses.  If any
  // of those return `abort`, the function returns immediately.
  const withCheckpoints = async (updown, checkpoints) => {
    const check = async checkpoint => {
      debug(`checkpoint: ${checkpoint}`);
      if (checkpoints[checkpoint]) {
        await checkpoints[checkpoint]();
      }
    };

    // do at most 10 items in a batch
    runOnlineBatches.setHook('batchSize', async batchSize => Math.min(batchSize, 10));

    // hook in before each batch and call a checkpoint function
    runOnlineBatches.setHook('preBatch', async (outerCount, count) => {
      if (outerCount === 0 && count === 0) {
        await check('preOnline');
      } else if (count > 20) {
        if (updown === 'up') {
          sawMigrationBatches = true;
        } else {
          sawDowngradeBatches = true;
        }

        await check('midOnline');
      }
    });

    await check('start');
    try {
      if (updown === 'up') {
        await helper.upgradeTo(THIS_VERSION);
      } else {
        await helper.downgradeTo(PREV_VERSION);
      }
    } catch (err) {
      if (err.code === 'ABORT!') {
        debug('migration/downgrade aborted');
        return;
      }
      throw err;
    }
    await check('done');
  };

  const assertSawBatches = () => {
    // these are checks to make sure that there are sufficient batches of online
    // migration and downgrade for the tests to be effective; if these fail, add more
    // test data.  Set DEBUG=showProgress to help debugging.
    if (onlineMigration) {
      assert(sawMigrationBatches, 'did not see multiple batches of online migration');
    }
    if (onlineDowngrade) {
      assert(sawDowngradeBatches, 'did not see multiple batches of online downgrade');
    }
  };

  suite(`dbVersionTest for v${version}`, function() {
    setup(async function() {
      sawMigrationBatches = false;
      sawDowngradeBatches = false;
      await resetDb({ testDbUrl: dbUrl });
      await helper.upgradeTo(PREV_VERSION);
      await helper.withDbClient(createData);
    });

    teardown(async function() {
      runOnlineBatches.resetHooks();
    });

    test('successful upgrade, downgrade process', async function() {
      await helper.withDbClient(async client => {
        await startCheck(client);
        await withCheckpoints('up', {
          start: async () => await concurrentCheck(client),
          preOnline: async () => await concurrentCheck(client),
          midOnline: async () => await concurrentCheck(client),
          done: async () => await concurrentCheck(client),
        });
        await finishedCheck(client);
        await withCheckpoints('down', {
          start: async () => await concurrentCheck(client),
          preOnline: async () => await concurrentCheck(client),
          midOnline: async () => await concurrentCheck(client),
          done: async () => await concurrentCheck(client),
        });
        await startCheck(client);
        assertSawBatches();
      });
    });

    // remainder of the tests are only interesting with an online migration and downgrade
    if (!onlineMigration && !onlineDowngrade) {
      return;
    }

    test('upgrade fails mid-online, restarted, downgrade fails mid-online, restarted', async function() {
      await helper.withDbClient(async client => {
        await startCheck(client);
        await withCheckpoints('up', {
          midOnline: async () => { throw abort; },
        });
        await withCheckpoints('up', {
          start: async () => await concurrentCheck(client),
          preOnline: async () => await concurrentCheck(client),
          midOnline: async () => await concurrentCheck(client),
          done: async () => await concurrentCheck(client),
        });
        await finishedCheck(client);
        await withCheckpoints('down', {
          midOnline: async () => { throw abort; },
        });
        await withCheckpoints('down', {
          start: async () => await concurrentCheck(client),
          preOnline: async () => await concurrentCheck(client),
          midOnline: async () => await concurrentCheck(client),
          done: async () => await concurrentCheck(client),
        });
        await startCheck(client);
        assertSawBatches();
      });
    });

    test('restart upgrades and downgrades repeatedly', async function() {
      await helper.withDbClient(async client => {
        await startCheck(client);
        await withCheckpoints('up', {
          midOnline: async () => { throw abort; },
        });
        await withCheckpoints('down', {
          midOnline: async () => { throw abort; },
        });
        await withCheckpoints('up', {
          midOnline: async () => { throw abort; },
        });
        await withCheckpoints('down', {
          midOnline: async () => { throw abort; },
        });
        await withCheckpoints('up', {
          start: async () => await concurrentCheck(client),
          preOnline: async () => await concurrentCheck(client),
          midOnline: async () => await concurrentCheck(client),
          done: async () => await concurrentCheck(client),
        });
        await finishedCheck(client);
        assertSawBatches();
      });
    });

    test('upgrade fails mid-online, downgrade', async function() {
      await helper.withDbClient(async client => {
        await withCheckpoints('up', {
          midOnline: async () => { throw abort; },
        });
        await withCheckpoints('down', {
          start: async () => await concurrentCheck(client),
          preOnline: async () => await concurrentCheck(client),
          midOnline: async () => await concurrentCheck(client),
          done: async () => await concurrentCheck(client),
        });
        await startCheck(client);
        assertSawBatches();
      });
    });
  });
};

/**
 * Compare two dates and assert them to be approximately equal.  This is
 * used for cases where the DB function uses `NOW()`.  It asserts the dates
 * are within an hour of each other, to allow lots of room for time skew
 * between the tests and the DB.
 */
helper.assertDateApproximately = (got, expected, message) => {
  const diff = Math.abs(got - expected);
  assert(diff < 3600, message || `${got} not within 1h of ${expected}`);
};
