const prettyMilliseconds = require('pretty-ms');
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
      if (ALLOWED_TABLES.includes(t)) {
        tables.push(t);
      }
    }
  }

  for (let tableName of tables) {
    tasks.push({
      title: `Import Table ${tableName}`,
      locks: ['concurrency'],
      requires: [],
      provides: [tableName],
      run: async (requirements, utils) => {
        const start = new Date();
        const entities = await readAzureTable({azureCreds: credentials.azure, tableName, utils});

        await writeToPostgres(tableName, entities, db, ALLOWED_TABLES);

        return {
          [tableName]: {
            elapsedTime: new Date() - start,
            rowsImported: entities ? entities.length : 0,
          },
        };
      },
    });
  }

  tasks.push({
    title: 'Importer Metadata',
    requires: tables,
    provides: ['metadata'],
    run: async (requirements, utils) => {
      const total = {
        rowsImported: 0,
        elapsedTime: 0,
      };
      const prettify = (header, rowsImported, elapsedTime) => {
        return [
          `--- ${header} ---`,
          `Rows imported: ${rowsImported}`,
          `Elapsed time: ${prettyMilliseconds(elapsedTime)}`,
          '',
        ].join('\n');
      };
      const tablesMetadata = tables
        .map(tableName => {
          const { rowsImported, elapsedTime } = requirements[tableName];

          total.rowsImported += rowsImported;
          total.elapsedTime += elapsedTime;

          return prettify(tableName, rowsImported, elapsedTime);
        })
        .join('\n');
      const totalMetadata = prettify('Summary', total.rowsImported, total.elapsedTime);

      return {
        metadata: [totalMetadata, tablesMetadata].join('\n'),
      };
    },
  });

  return tasks;
};

module.exports = importer;
