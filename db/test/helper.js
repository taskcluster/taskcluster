const assert = require('assert');
const {Pool} = require('pg');
const {WRITE, ignorePgErrors} = require('taskcluster-lib-postgres');
const {resetDb} = require('taskcluster-lib-testing');
const tcdb = require('taskcluster-db');
const debug = require('debug')('db-helper');
const {UNDEFINED_TABLE} = require('taskcluster-lib-postgres');

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
            id: 'db-tests',
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

    await resetDb({testDbUrl: exports.dbUrl});
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
      monitor: false,
      dbCryptoKeys: [
        {
          id: 'db-tests',
          algo: 'aes-256',
          // only used for tests
          key: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
        },
      ],
    });

    exports.fakeDb = await tcdb.fakeSetup({
      serviceName,
      dbCryptoKeys: [
        {
          id: 'db-tests',
          algo: 'aes-256',
          // only used for tests
          key: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
        },
      ],
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
 * Assert that the given table does not exist (used to test table deletion in
 * downgrade scripts).
 */
exports.assertNoTable = async name => {
  await exports.withDbClient(async client => {
    await assert.rejects(() => client.query(`select * from ${name}`), err => err.code === UNDEFINED_TABLE);
  });
};

exports.azureTableNames = [
  'Clients',
  // roles is actually stored in a azure container but we're putting everything in a table now
  'Roles',
  'TaskclusterGithubBuilds',
  'TaskclusterIntegrationOwners',
  'TaskclusterChecksToTasks',
  'TaskclusterCheckRuns',
  'Hooks',
  'Queues',
  'LastFire3',
  'IndexedTasks',
  'Namespaces',
  'DenylistedNotification',
  'CachePurges',
  'QueueTasks',
  'QueueArtifacts',
  'QueueTaskGroups',
  'QueueTaskGroupMembers',
  'QueueTaskGroupActiveSets',
  'QueueTaskRequirement',
  'QueueTaskDependency',
  'QueueWorker',
  'QueueWorkerType',
  'QueueProvisioner',
  'Secrets',
  'AuthorizationCodesTable',
  'AccessTokenTable',
  'SessionStorageTable',
  'GithubAccessTokenTable',
  'WMWorkers',
  'WMWorkerPools',
  'WMWorkerPoolErrors',
];

/**
 * Define a bunch of tests to ensure that entity methods remain well-behaved as the table
 * behind them is upgraded to a "normal" postgres table.
 */
exports.testEntityTable = ({
  // the DB version being tested
  dbVersion,
  // serviceName (used to set up the Database)
  serviceName,
  // entity table name and new normal table name
  entityTableName, newTableName,
  // Entity class
  EntityClass,
  // named sample values, each given as an object containing entity properties
  samples,
  // array of {condition, expectedSample} where condition are passed to load,
  // and expectedSample is the name of the sample that should be returned
  loadConditions,
  // array of {condition, expectedSamples} where condition are passed to scan,
  // and expectedSamples is an array of names of the expected samples, in order.
  scanConditions,
  // array of {condition} that should return no results from load
  notFoundConditions,
  // things to skip because they are not implemented; options are 'create-overwrite'
  // 'remove-ignore-if-not-exists' (add yours here!)
  notImplemented = [],
  // array of {condition, modifier, checker} where condition are suitable to
  // load a single sample, modififer is suitable for Entity.modify, and checker
  // asserts the resulting entity was modified correctly.  If modifier is an array,
  // it is treated as a collection of modifier functions to run in parallel to check
  // support for concurrent modifications.
  modifications,
  // customTests can define additional test cases in the usual Mocha style.  The
  // parameter is true if the tests are run for THIS_VERSION, otherwise for PREV_VERSION.
}, customTests = (isThisVersion) => {}) => {
  const prevVersion = dbVersion - 1;
  // NOTE: these tests must run in order
  suite(`entity methods for ${entityTableName} / ${newTableName}`, function() {
    let Entity;
    let db;

    const resetTables = async () => {
      await exports.withDbClient(async client => {
        for (let tableName of [entityTableName, newTableName]) {
          await ignorePgErrors(client.query(`truncate ${tableName}`), UNDEFINED_TABLE);
        }
      });
    };

    suiteSetup(async function() {
      db = await exports.setupDb(serviceName);
      Entity = await EntityClass.setup({
        db,
        serviceName: 'test',
        tableName: entityTableName,
        monitor: false,
        context: {},
      });
    });

    const makeTests = () => {
      if (!notImplemented.includes('create-overwrite')) {
        test(`re-create entries, overwriting them`, async function() {
          for (let sample of Object.values(samples)) {
            await Entity.create(sample, true);
          }
        });
      }

      for (let {condition, expectedSample} of loadConditions) {
        test(`load ${JSON.stringify(condition)}`, async function() {
          const entity = await Entity.load(condition);
          assert.deepEqual(entity._properties, samples[expectedSample]);
        });
      }

      for (let {condition} of notFoundConditions) {
        test(`load ${JSON.stringify(condition)} (not found)`, async function() {
          const entity = await Entity.load(condition, true);
          assert.deepEqual(entity, undefined);
          await assert.rejects(
            () => Entity.load(condition),
            err => err.code === 'ResourceNotFound');
        });
      }

      for (let {condition, expectedSamples} of scanConditions) {
        test(`scan ${JSON.stringify(condition)} (${expectedSamples.length} results)`, async function() {
          const res = await Entity.scan(condition);
          const expected = expectedSamples.map(n => samples[n]);
          assert.deepEqual(res.entries.map(e => e._properties), expected);
        });

        if (expectedSamples.length > 1) {
          test(`scan ${JSON.stringify(condition)} (${expectedSamples.length} results) with pagination`, async function() {
            const batches = [];
            const query = {limit: 1};
            while (true) {
              const res = await Entity.scan(condition, query);
              batches.push(res.entries.map(e => e._properties));
              if (res.continuation) {
                query.continuation = res.continuation;
              } else {
                break;
              }
            }
            const expected = expectedSamples.map(n => [samples[n]]);
            assert.deepEqual(batches, expected);
          });
        }
      }

      for (let {condition, modifier, checker} of modifications) {
        if (!Array.isArray(modifier)) {
          modifier = [modifier];
        }
        test(`modify ${JSON.stringify(condition)}`, async function() {
          const ent = await Entity.load(condition);
          await Promise.all(modifier.map(mod => ent.modify(mod)));
          const ent3 = await Entity.load(condition);
          checker(ent3);
        });
      }

      for (let {condition} of loadConditions) {
        test(`remove ${JSON.stringify(condition)}`, async function() {
          await Entity.remove(condition);
          const entity = await Entity.load(condition, true);
          assert.equal(entity, undefined);

          if (notImplemented.includes('remove-ignore-if-not-exists')) {
            return;
          }

          // set ignoreIfNotExists (should not reject)
          await Entity.remove(condition, true);

          await assert.rejects(
            () => Entity.remove(condition),
            err => err.code === 'ResourceNotFound');
        });
      }
    };

    suite(`db version ${prevVersion}`, function() {
      suiteSetup(async function() {
        await exports.upgradeTo(prevVersion);
      });

      setup(async function() {
        await resetTables();
        await Promise.all(Object.values(samples).map(
          sample => Entity.create(sample)));
      });

      makeTests.call(this);
      customTests.call(this, false);
    });

    suite(`db version ${prevVersion} -> ${dbVersion} preserves data`, function() {
      suiteSetup(async function() {
        await resetTables();
        await Promise.all(Object.values(samples).map(
          sample => Entity.create(sample)));
        await exports.upgradeTo(dbVersion);
      });

      for (let {condition, expectedSample} of loadConditions) {
        test(`load ${JSON.stringify(condition)}`, async function() {
          const entity = await Entity.load(condition);
          assert.deepEqual(entity._properties, samples[expectedSample]);
        });
      }
    });

    suite(`db version ${dbVersion}`, function() {
      suiteSetup(async function() {
        await exports.upgradeTo(dbVersion);
      });

      setup(async function() {
        await resetTables();
        await Promise.all(Object.values(samples).map(
          sample => {
            return Entity.create(sample);
          }));
      });

      makeTests();
      customTests.call(this, true);
    });

    suite(`db version ${dbVersion} -> ${prevVersion} preserves data`, function() {
      suiteSetup(async function() {
        await exports.upgradeTo(dbVersion);
        await resetTables();
        await Promise.all(Object.values(samples).map(
          sample => Entity.create(sample)));
        await exports.downgradeTo(prevVersion);
      });

      for (let {condition, expectedSample} of loadConditions) {
        test(`load ${JSON.stringify(condition)}`, async function() {
          const entity = await Entity.load(condition);
          assert.deepEqual(entity._properties, samples[expectedSample]);
        });
      }
    });
  });
};
