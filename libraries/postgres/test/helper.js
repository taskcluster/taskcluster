const {Client} = require('pg');
const dbUrl = process.env.TEST_DB_URL;

/**
 * Tests should always use this serviceName (as this is the schema that
 * the tests will clean out)
 */
exports.serviceName = 'taskcluster-lib-postgres';

/**
 * dbSuite(..) is a replacement for suite(..) that sets this.dbUrl when
 * a dbUrl exists, or skips when none is available.
 */
if (dbUrl) {
  exports.dbSuite = (...args) => {
    suite(...args.slice(0, -1), function() {
      suiteSetup('setup database', function() {
        this.dbUrl = dbUrl;
      });
      setup('clear database', async function() {
        await clearDb(dbUrl);
      });
      args[args.length - 1].call(this);
    });
  };
} else {
  // TODO: check NO_TEST_SKIP
  console.error('Set TEST_DB_URL to run tests for this library');
  exports.dbSuite = (...args) => {
    suite(...args.slice(0, -1), function() {
      suiteSetup(function() {
        this.pending = true;
      });
      args[args.length - 1].call(this);
    });
  };
}

const clearDb = async dbUrl => {
  const client = new Client({connectionString: dbUrl});
  await client.connect();
  try {
    const schemaName = exports.serviceName.replace(/-/g, '_');
    await client.query(`drop schema if exists ${schemaName} cascade`);
  } finally {
    client.end();
  }
};
