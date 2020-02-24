const _ = require('lodash');
const glob = require('glob');
const {REPO_ROOT, readRepoYAML} = require('../utils');
const azure = require('fast-azure-storage');
const writeToPostgres = require('./writeToPostgres');

const importer = async ({azureCreds}) => {
  const tasks = [];

  let tables = [];
  for (let path of glob.sync('services/*/azure.yml', {cwd: REPO_ROOT})) {
    const azureYml = await readRepoYAML(path);
    for (let t of azureYml.tables || []) {
      tables.push(t);
    }
  }

  for (let tableName of tables) {
    tasks.push({
      title: `Import Table ${tableName}`,
      locks: ['concurrency'],
      requires: [],
      provides: [],
      run: async (requirements, utils) => {
        const tableEntities = await importTable({azureCreds, tableName, utils});

        await writeToPostgres(tableName, tableEntities, utils);
      },
    });
  }

  return tasks;
};

const importTable = async ({azureCreds, tableName, utils}) => {
  const table = new azure.Table(azureCreds);
  const entities = [];

  const processResult = results => {
    const firstEntity = _.head(results.entities);
    const azureKeys = firstEntity ? Object.keys(results.entities[0]).filter(key => key.includes('odata')) : [];
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
    tableParams = _.pick(results, ['nextPartitionKey', 'nextRowKey']);
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

module.exports = importer;
