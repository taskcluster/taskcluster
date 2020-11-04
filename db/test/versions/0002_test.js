const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { snakeCase } = require('snake-case');

// due to some differences in different versions of snake-case, we
// have some special-cases.  Everything else follows snake-case's
// snakeCase.
const POSTGRES_TABLE_NAMES = {
  LastFire3: 'last_fire_3',
  WMWorkers: 'wmworkers',
  WMWorkerPools: 'wmworker_pools',
  WMWorkerPoolErrors: 'wmworker_pool_errors',
};

const postgresTableName = azureTableName =>
  `${POSTGRES_TABLE_NAMES[azureTableName] || snakeCase(azureTableName)}_entities`;

const azureTableNames = [
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
  'WMWorkers',
  'WMWorkerPools',
  'WMWorkerPoolErrors',
];

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  /* Note that these tests run in order */

  test(`tables created on upgrade`, async function () {
    await helper.upgradeTo(1);

    for (let azureTableName of azureTableNames) {
      await helper.assertNoTable(postgresTableName(azureTableName));
    }

    await helper.upgradeTo(2);

    for (let azureTableName of azureTableNames) {
      await helper.assertTable(postgresTableName(azureTableName));
    }
  });

  test(`tables dropped on downgrade`, async function () {
    await helper.downgradeTo(1);
    for (let azureTableName of azureTableNames) {
      await helper.assertNoTable(postgresTableName(azureTableName));
    }
  });
});
