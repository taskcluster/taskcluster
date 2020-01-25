const { Database } = require('taskcluster-lib-postgres');
const dbUrl = process.env.TEST_DB_URL;

/**
 * dbSuite(..) is a replacement for suite(..) that sets this.dbUrl when
 * a dbUrl exists, or skips when none is available.
 */
if (dbUrl) {
  exports.dbSuite = (...args) => {
    exports.dbUrl = dbUrl;
    suite(...args.slice(0, -1), function() {
      args[args.length - 1].call(this);
    });
  };
} else {
  exports.dbSuite = (...args) => {
    suite(...args.slice(0, -1), function() {
      if (process.env.NO_TEST_SKIP) {
        throw new Error(`TEST_DB_URL not set and NO_TEST_SKIP is set`);
      }
      test.skip('(TEST_DB_URL is not set)', function() { });
    });
  };
}

exports.withDb = ({ schema, serviceName, clearBeforeTests }) => {
  suiteSetup(async function() {
    exports.db = await Database.setup({
      schema,
      readDbUrl: exports.dbUrl,
      writeDbUrl: exports.dbUrl,
      serviceName,
    });

    await exports.db._withClient('write', async client => {
      await client.query(`drop schema if exists public cascade`);
      await client.query(`create schema public`);
    });

    await Database.upgrade({
      schema,
      adminDbUrl: exports.dbUrl,
      usernamePrefix: 'test',
    });
  });

  if (clearBeforeTests) {
    setup(async function() {
      await exports.db._withClient(
        'write',
        client => client.query(`delete from azure_queue_messages`));
    });
  }

  suiteTeardown(async function() {
    if (exports.db) {
      try {
        await exports.db.close();
      } finally {
        exports.db = null;
      }
    }
  });
};
