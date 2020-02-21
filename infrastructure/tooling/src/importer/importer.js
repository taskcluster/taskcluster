const _ = require('lodash');
const zlib = require('zlib');
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
        const table = await importTable({azureCreds, tableName, utils});

        await writeToPostgres(table);
      },
    });
  }

  return tasks;
};

const importTable = async ({azureCreds, tableName, utils}) => {
  const stream = new zlib.createGzip();
  const table = new azure.Table(azureCreds);

  const processEntities = entities => entities.map(
    entity => stream.write(JSON.stringify(entity) + '\n'));

  let count = 0;
  let nextUpdateCount = 1000;
  let tableParams = {};
  do {
    let results;
    try {
      results = await table.queryEntities(tableName, tableParams);
      if (tableName === 'WMWorkerPools') {
        console.log(results);
        process.exit(1);
      }
    } catch (err) {
      if (err.statusCode === 404) {
        utils.skip("no such table");
        return;
      }
      throw err;
    }
    tableParams = _.pick(results, ['nextPartitionKey', 'nextRowKey']);
    processEntities(results.entities);
    count = count + results.entities.length;
    if (count > nextUpdateCount) {
      utils.status({
        message: `${count} rows`,
      });
      nextUpdateCount = count + 100;
    }
  } while (tableParams.nextPartitionKey && tableParams.nextRowKey);

  stream.end();

  return stream;
};

module.exports = importer;
