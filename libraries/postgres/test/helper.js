import pg from 'pg';
import { withMonitor } from 'taskcluster-lib-testing';
import { MonitorManager } from 'taskcluster-lib-monitor';
const testDbUrl = process.env.TEST_DB_URL;

withMonitor({ }, { noLoader: true });

const monitor = MonitorManager.setup({
  serviceName: 'tc-lib-postgres',
  fake: true,
  debug: true,
  validate: true,
});

/**
 * dbSuite(..) is a replacement for suite(..) that sets this.dbUrl when
 * a dbUrl exists, or skips when none is available.
 */
const helper = {
  dbSuite: undefined,
  dbUrl: undefined,
  monitor,
};
const helperProxy = new Proxy(helper, {
  get(target, propKey) {
    if (propKey in target) {
      return target[propKey];
    }
    throw new Error(`helper.${propKey} is not defined`);
  },
});

if (testDbUrl) {
  helper.dbSuite = (...args) => {
    suite(...args.slice(0, -1), function() {
      suiteSetup('setup database', function() {
        helper.dbUrl = testDbUrl;
      });
      setup('clear database', async function() {
        await clearDb(testDbUrl);
      });
      args[args.length - 1].call(this);
    });
  };
} else {
  helper.dbSuite = (...args) => {
    suite(...args.slice(0, -1), function() {
      if (process.env.NO_TEST_SKIP) {
        throw new Error(`TEST_DB_URL not set and NO_TEST_SKIP is set`);
      }
      test.skip('(TEST_DB_URL is not set)', function() { });
    });
  };
}

const clearDb = async dbUrl => {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(`drop schema if exists public cascade`);
    await client.query(`create schema public`);
  } finally {
    await client.end();
  }
};

export default helperProxy;
