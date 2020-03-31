const _ = require('lodash');
const azure = require('fast-azure-storage');
const {postgresTableName} = require('taskcluster-lib-entities');
const assert = require('assert').strict;

exports.fail = msg => {
  console.error(msg);
  process.exit(1);
};

exports.requireEnv = name => {
  if (process.env[name]) {
    return process.env[name];
  }
  throw new Error(`$${name} must be given`);
};

// tables that are allowed to migrate
exports.ALLOWED_TABLES = [
  // 'Clients',
  // 'Hooks',
  'IndexedTasks',
  'QueueTasks',
  'TaskclusterGithubBuilds',
  'TaskclusterIntegrationOwners',
  'TaskclusterChecksToTasks',
  'TaskclusterCheckRuns',
  // 'Queues',
  // 'LastFire3',
  'Namespaces', 'DenylistedNotification',
  'CachePurges',
  'QueueArtifacts',
  'QueueTaskGroups',
  'QueueTaskGroupMembers',
  'QueueTaskGroupActiveSets',
  'QueueTaskRequirement',
  'QueueTaskDependency',
  'QueueWorker',
  'QueueWorkerType',
  'QueueProvisioner',
  // 'Secrets',
  'AuthorizationCodesTable',
  // 'AccessTokenTable',
  // 'SessionStorageTable',
  // 'GithubAccessTokenTable',
  'WMWorkers',
  'WMWorkerPools',
  'WMWorkerPoolErrors',
];

// read table from azure
// returns a list of azure entities
exports.readAzureTable = async ({azureCreds, tableName, utils, tableParams = {}, rowsProcessed = 0}) => {
  const table = new azure.Table(azureCreds);
  const entities = [];

  const processResult = results => {
    const firstEntity = _.head(results.entities);
    const azureKeys = firstEntity ? Object.keys(results.entities[0]).filter(key => key.includes('odata') || key === 'Version') : [];
    const filteredEntities = results.entities.map(
      entity => {
        azureKeys.forEach(key => delete entity[key]);

        return entity;
      },
    );

    entities.push(...filteredEntities);
  };

  let results;
  try {
    results = await table.queryEntities(tableName, tableParams);
    processResult(results);
  } catch (err) {
    if (err.statusCode === 404) {
      utils.skip("no such table");
      return;
    }
    throw err;
  }
  const count = rowsProcessed + results.entities.length;
  utils.status({
    message: `${count} rows`,
  });

  return { entities, tableParams: _.pick(results, ['nextPartitionKey', 'nextRowKey']), count };
};

// Given a list of azure entities, this method will write to a postgres database
exports.writeToPostgres = async (tableName, entities, db, allowedTables = [], mode = 'admin') => {
  // to allow us to migrate one table at a time
  if (!allowedTables.includes(tableName)) {
    return;
  }

  const pgTable = postgresTableName(tableName);

  if (entities) {
    for (let entity of entities) {
      await db._withClient(mode, async client => {
        await client.query(
          `insert into ${pgTable}(partition_key, row_key, value, version, etag) values ($1, $2, $3, 1, public.gen_random_uuid())`,
          [entity.PartitionKey, entity.RowKey, entity],
        );
      });
    }
  }
};

// Given a list of azure entities, this method will throw an error if the data
// is not on par with the values in postgres.
exports.verifyWithPostgres = async (tableName, entities, db, allowedTables = [], mode = 'admin') => {
  // verify only tables that have been migrated
  if (!allowedTables.includes(tableName)) {
    return;
  }

  const compareTables = ({ azureEntities, postgresEntities }) => {
    const sortedAzureEntities = azureEntities.sort(sort);
    const sortedPostgresEntities = postgresEntities.sort(sort);

    assert.equal(sortedAzureEntities.length, sortedPostgresEntities.length);
    assert.deepEqual(sortedAzureEntities, sortedPostgresEntities);
  };
  const sort = (entityA, entityB) => {
    const keyA = `${entityA.PartitionKey}-${entityA.RowKey}`;
    const keyB = `${entityB.PartitionKey}-${entityB.RowKey}`;

    return keyA.localeCompare(keyB);
  };

  const pgTable = postgresTableName(tableName);
  const azureKeys = _.head(entities) ? Object.keys(entities).filter(key => key.includes('odata') || key === 'Version') : [];
  // remove azure specific keys before comparing it to the values from postgres
  const azureEntries = entities
    ? entities.map(
      entity => {
        azureKeys.forEach(key => delete entity[key]);

        return entity;
      })
    : [];
  await db._withClient(mode, async client => {
    const result = await client.query(
      `select * from ${pgTable}`,
    );
    compareTables({ azureEntities: azureEntries, postgresEntities: result.rows.map(({ value }) => value) });
  });
};
