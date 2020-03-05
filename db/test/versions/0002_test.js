const assert = require('assert').strict;
const path = require('path');
const { snakeCase } = require('change-case');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const tcdb = require('taskcluster-db');
const {Schema, UNDEFINED_TABLE} = require('taskcluster-lib-postgres');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();
  const azureTableNames = [
    'Clients',
    // roles is actually stored in a azure container but we're putting everything in a table now
    'Roles',
    'TaskclusterGithubBuilds',
    'TaskclusterIntergrationOwners',
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

  const assertNoTable = async postgresTableName => {
    await helper.withDbClient(async client => {
      await assert.rejects(
        () => client.query(`select * from ${postgresTableName}`),
        err => err.code === UNDEFINED_TABLE);
    });
  };

  const assertTable = async postgresTableName => {
    await helper.withDbClient(async client => {
      const res = await client.query(`select * from ${postgresTableName}`);
      assert.deepEqual(res.rows, []);
    });
  };

  /* Note that these tests run in order */

  test(`tables created on upgrade`, async function () {
    await helper.upgradeTo(1);

    for (let azureTableName of azureTableNames) {
      const postgresTableName = `${snakeCase(azureTableName)}_entities`;
      await assertNoTable(postgresTableName);
    }

    await helper.upgradeTo(2);

    for (let azureTableName of azureTableNames) {
      const postgresTableName = `${snakeCase(azureTableName)}_entities`;
      await assertTable(postgresTableName);
    }
  });

  test(`tables dropped on downgrade`, async function () {
    await helper.downgradeTo(1);
    for (let azureTableName of azureTableNames) {
      const postgresTableName = `${snakeCase(azureTableName)}_entities`;
      await assertNoTable(postgresTableName);
    }
  });

  test('stored function bodies match those in tc-lib-entities tests', function() {
    // This is a meta-check to ensure that the tests in tc-lib-entities, which
    // use a private copy of the stored functions, are testing the exact same
    // thing as we are using in version 0002.
    const testSchema = Schema.fromDbDirectory(path.join(__dirname, '../../../libraries/entities/test/db'));
    const testVersion = testSchema.getVersion(1);

    const realSchema = tcdb.schema({useDbDirectory: true});
    const realVersion = realSchema.getVersion(2);
    for (let azureTableName of azureTableNames) {
      const postgresTableName = `${snakeCase(azureTableName)}_entities`;
      for (let methodSuffix of ['load', 'create', 'remove', 'modify', 'scan']) {
        const method = `${postgresTableName}_${methodSuffix}`;

        const realMethod = realVersion.methods[method].body;
        assert(realMethod, `Method ${method} not defined`);

        const testMethod = testVersion.methods[`test_entities_${methodSuffix}`].body;
        assert.equal(testMethod.replace(/test_entities/g, postgresTableName), realMethod);
      }
    }
  });
});
