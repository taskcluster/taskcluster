const _ = require('lodash');
const azure = require('fast-azure-storage');
const {postgresTableName} = require('taskcluster-lib-entities');

exports.fail = msg => {
  console.error(msg);
  process.exit(1);
};

// tables that are allowed to migrate
exports.ALLOWED_TABLES = [
  'Clients',
  'Hooks',
  'QueueArtifacts',
  'QueueTasks',
  'QueueTaskDependency',
  'IndexedTasks',
  'QueueTaskGroupMembers',
  'WMWorkerPoolErrors',
  'Queues',
  'LastFire3',
  'Namespaces',
  'DenylistedNotification',
  'CachePurges',
  'QueueTaskGroups',
  'QueueTaskGroupActiveSets',
  'QueueTaskRequirement',
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
  'TaskclusterGithubBuilds',
  'TaskclusterIntegrationOwners',
  'TaskclusterChecksToTasks',
  'TaskclusterCheckRuns',

  // (actually a continer, but that's OK)
  'Roles',
];

// tables that are either signed or encrypted, and thus can't be imported
// across deployments.  Set EXCLUDE_CRYPTO=1 to exclude these without modifying
// the source code.
exports.CRYPTO_TABLES = [
  'Clients',
  'Hooks',
  'Queues',
  'LastFire3',
  'Secrets',
  'AccessTokenTable',
  'SessionStorageTable',
  'GithubAccessTokenTable',
];

// For certain tables, we would like to import faster to make sure we don't
// spend over 8 hours (TCW duration) importing
exports.LARGE_TABLES = [
  'QueueArtifacts',
  'QueueTasks',
].filter(tableName => exports.ALLOWED_TABLES.includes(tableName));

// NOTE: Azure's ordering is -, 0-9, A-Z, _, a-z
exports.TASKID_RANGES = [
  [undefined, '1'],
  ['1', '5'],
  ['5', '8'],
  ['8', 'A'],
  ['A', 'E'],
  ['E', 'I'],
  ['I', 'N'],
  ['N', 'U'],
  ['U', 'Z'],
  ['Z', 'a'],
  ['a', 'e'],
  ['e', 'i'],
  ['i', 'n'],
  ['n', 'u'],
  ['u', undefined],
];

exports.sleep = ms => new Promise(res => setTimeout(res, ms));

// read table from azure
// yields azure entities
exports.readAzureTableInChunks = async function* ({azureCreds, tableName, filter}) {
  const table = new azure.Table(azureCreds);
  let tableParams = {filter};
  let entities = [];

  const processResult = results => {
    const firstEntity = _.head(results.entities);
    const azureKeys = firstEntity ? Object.keys(results.entities[0]).filter(key => key.includes('odata') || key === 'Version') : [];
    entities = results.entities.map(
      entity => {
        azureKeys.forEach(key => delete entity[key]);

        return entity;
      },
    );
  };

  while (1) {
    try {
      const results = await table.queryEntities(tableName, tableParams);
      processResult(results);

      tableParams = { filter: tableParams.filter, ..._.pick(results, ['nextPartitionKey', 'nextRowKey']) };

      for (let entity of entities) {
        yield entity;
      }

      if (!tableParams.nextPartitionKey && !tableParams.nextRowKey) {
        break;
      }
    } catch (err) {
      if (err.statusCode === 404) {
        return;
      }
      throw err;
    }
  }
};

// Given a list of azure entities, this method will write to a postgres database
exports.writeToPostgres = async (tableName, entities, db, mode = 'admin') => {
  const pgTable = postgresTableName(tableName);

  while (1) {
    try {
      await db._withClient(mode, async client => {
        const entitiesSize = entities.length;

        const [vars, args] = entities.reduce((acc, curr, i) => {
          let [vars, args] = acc;

          if (i !== 0) {
            vars = `${vars},`;
          }

          vars = `${vars}(\$${i * 3 + 1}, \$${i * 3 + 2}, \$${i * 3 + 3}, 1, public.gen_random_uuid())`;

          args[i * 3] = entities[i].PartitionKey;
          args[i * 3 + 1] = entities[i].RowKey;
          args[i * 3 + 2] = entities[i];

          return [vars, args];
        }, ['', new Array(entitiesSize * 3)]);

        if (args && vars) {
          await client.query(
            `insert into ${pgTable}(partition_key, row_key, value, version, etag) values ${vars}`,
            args,
          );
        }
      });
    } catch (err) {
      // DB shutting down -- wait and retry
      if (err.code === '57P03' || err.code === '57P01') {
        await exports.sleep(1000);
        continue;
      }
      throw err;
    }
    break;
  }
};
