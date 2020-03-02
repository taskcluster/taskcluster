const assert = require('assert').strict;
const { snakeCase } = require('change-case');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const {UNDEFINED_TABLE} = require('taskcluster-lib-postgres');

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

  azureTableNames.forEach(azureTableName => {
    const postgresTableName = `${snakeCase(azureTableName)}_entities`;

    test(`${postgresTableName} table initially not created`, async function () {
      await helper.withDbClient(async client => {
        await assert.rejects(
          () => client.query(`select * from ${postgresTableName}`),
          err => err.code === UNDEFINED_TABLE);
      });
    });
  });
  azureTableNames.forEach(azureTableName => {
    const postgresTableName = `${snakeCase(azureTableName)}_entities`;

    test(`${postgresTableName} table created`, async function () {
      await helper.upgradeTo(2);

      await helper.withDbClient(async client => {
        const res = await client.query(`select * from ${postgresTableName}`);
        assert.deepEqual(res.rows, []);
      });
    });
  });
});
