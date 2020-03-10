const glob = require('glob');
const {REPO_ROOT, readRepoYAML} = require('../utils');
const { readAzureTable, writeToPostgres, ALLOWED_TABLES } = require('./util');

const importer = async options => {
  const { credentials, db } = options;
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
        const entities = await readAzureTable({azureCreds: credentials.azure, tableName, utils});

        await writeToPostgres(tableName, entities, db, ALLOWED_TABLES);
      },
    });
  }

  return tasks;
};

module.exports = importer;
