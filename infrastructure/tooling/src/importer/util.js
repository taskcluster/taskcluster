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
  'QueueArtifacts',
  'QueueTasks',
  'QueueTaskDependency',
  'IndexedTasks',
  'QueueTaskGroupMembers',
  'WMWorkerPoolErrors',
  // 'Queues',
  // 'LastFire3',
  'Namespaces',
  'DenylistedNotification',
  'CachePurges',
  'QueueTaskGroups',
  'QueueTaskGroupActiveSets',
  'QueueTaskRequirement',
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
  'TaskclusterGithubBuilds',
  'TaskclusterIntegrationOwners',
  'TaskclusterChecksToTasks',
  'TaskclusterCheckRuns',
];

// For certain tables, we would like to import faster to make sure we don't
// spend over 8 hours (TCW duration) importing
exports.LARGE_TABLES = [
  'QueueArtifacts',
  'QueueTasks',
].filter(tableName => exports.ALLOWED_TABLES.includes(tableName));

// read table from azure
// returns a list of azure entities
//
// Note: Make sure there is enough memory on the machine when running this
// function on a large table. The full table will be stored in memory
// so there is a chance of OOM.
exports.readAzureTable = async ({azureCreds, tableName, utils}) => {
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

  let count = 0;
  let nextUpdateCount = 1000;
  let tableParams = {};
  do {
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
    tableParams = { filter: tableParams.filter, ..._.pick(results, ['nextPartitionKey', 'nextRowKey']) };
    count = count + results.entities.length;
    if (count > nextUpdateCount) {
      utils.status({
        message: `${count} rows`,
      });
      nextUpdateCount = count + 100;
    }
  } while (tableParams.nextPartitionKey && tableParams.nextRowKey);

  return entities;
};

// read table from azure
// returns a list of azure entities
exports.readAzureTableInChunks = async function* ({azureCreds, tableName, utils, tableParams = {}, rowsProcessed = 0}) {
  const table = new azure.Table(azureCreds);
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

      rowsProcessed += entities.length;
      utils.status({
        message: `${rowsProcessed} rows`,
      });
      tableParams = { filter: tableParams.filter, ..._.pick(results, ['nextPartitionKey', 'nextRowKey']) };

      yield { entities, count: rowsProcessed };

      if (!tableParams.nextPartitionKey && !tableParams.nextRowKey) {
        break;
      }
    } catch (err) {
      if (err.statusCode === 404) {
        utils.skip("no such table");
        return;
      }
      throw err;
    }
  }
};

// Given a list of azure entities, this method will write to a postgres database
exports.writeToPostgres = async (tableName, entities, db, allowedTables = [], mode = 'admin') => {
  // to allow us to migrate one table at a time
  if (!allowedTables.includes(tableName)) {
    return;
  }

  const pgTable = postgresTableName(tableName);

  if (entities) {
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
