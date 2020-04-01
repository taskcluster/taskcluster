const buffer = require('buffered-async-iterator');
const prettyMilliseconds = require('pretty-ms');
const glob = require('glob');
const {postgresTableName} = require('taskcluster-lib-entities');
const {REPO_ROOT, readRepoYAML} = require('../utils');
const { readAzureTableInChunks, writeToPostgres, ALLOWED_TABLES } = require('./util');

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

        const pgTable = postgresTableName(tableName);

        await db._withClient('admin', async client => {
          await client.query(`truncate ${pgTable}`);
        });

        async function* readAzureTableIterator(args) {
          yield await readAzureTableInChunks(args);
        }

        async function importTable(tableParameters = {}, rowsProcessed = 0) {
          for await (let result of buffer(
            readAzureTableIterator({
              azureCreds: credentials.azure,
              tableName,
              utils,
              tableParams: tableParameters,
              rowsProcessed,
            }),
            1000,
          )) {
            if (result) {
              const { entities, tableParams, count } = result;

              await writeToPostgres(tableName, entities, db, ALLOWED_TABLES);

              if (tableParams.nextPartitionKey && tableParams.nextRowKey) {
                return await importTable(tableParams, count);
              }

              return count;
            }

            return 0;
          }
        }

        const rowsImported = await importTable();

        return {
          [tableName]: {
            elapsedTime: new Date() - start,
            rowsImported,
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
