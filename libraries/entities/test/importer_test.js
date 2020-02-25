const helper = require('./helper');
const path = require('path');
const assert = require('assert').strict;
const importer = require('../../../infrastructure/tooling/src/importer/importer');
const { rewriteScript } = require('../../../infrastructure/tooling/src/importer/util');
const { readRepoFile } = require('../../../infrastructure/tooling/src/utils');

helper.dbSuite(path.basename(__filename), function() {
  let db;

  teardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  const credentials = {
    azure: {
      accountId: process.env.AZURE_ACCOUNT,
      accessKey: process.env.AZURE_ACCOUNT_KEY,
    },
    postgres: {
      readDbUrl: process.env.TEST_DB_URL,
      writeDbUrl: process.env.TEST_DB_URL,
    },
  };
  const NOOP = () => {};
  const utils = { waitFor: NOOP, skip: NOOP, status: NOOP, step: NOOP };

  suite('importer', function() {
    test('azure-entities imports are changed to tc-lib-entities', async function() {
      const originalContent = await readRepoFile('libraries/entities/test/fixtures/imports.js');
      assert.equal(originalContent.match(/azure-entities/g).length, 4);
      assert.equal(originalContent.match(/taskcluster-lib-entities/g), null);

      const result = await rewriteScript('libraries/entities/test/fixtures/imports.js');
      assert.equal(result.match(/azure-entities/g), null);
      assert.equal(result.match(/taskcluster-lib-entities/g).length, 4);
    });
    test('azure-entities relative imports are changed to absolute paths', async function() {
      const originalContent = await readRepoFile('libraries/entities/test/fixtures/relative_paths.js');

      assert.equal(originalContent.match(/require\(['"]([.{1,2}\/]+)([^'"]+)['"]\)/g).length, 4);

      const result = await rewriteScript('libraries/entities/test/fixtures/relative_paths.js');
      assert.equal(result.match(/require\(['"]([^\/][.{1,2}\/]+)([^'"]+)['"]\)/g), null);
      assert.equal(result.match(/taskcluster-lib-entities/g).length, 5);
    });
    test('importer throws when script is not found', async function() {
      await assert.rejects(
        async () => {
          await readRepoFile('foo/bar/libraries/entities/test/fixtures/data.js');
        },
        /ENOENT: no such file or directory/,
      );
    });
    test('importer writes to the db', async function() {
      const tasks = await importer({ credentials });

      for (let task of tasks) {
        await task.run(null, utils);
      }
    });
  });
});
