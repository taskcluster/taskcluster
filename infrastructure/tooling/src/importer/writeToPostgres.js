const { azurePostgresTableNameMapping } = require('./util');

const writeToPostgres = async (tableName, entities, db, utils) => {
  // to allow us to migrate one table at a time
  const ALLOWED_TABLES = ['Clients'];

  if (!ALLOWED_TABLES.includes(tableName)) {
    return;
  }

  const postgresTableName = azurePostgresTableNameMapping(tableName);

  await db._withClient('admin', async client => {
    await client.query(`truncate ${postgresTableName}`);
  });

  for (let entity of entities) {
    await db._withClient('admin', async client => {
      await client.query(
        `insert into ${postgresTableName}(partition_key, row_key, value, version, etag) values ($1, $2, $3, 1, public.gen_random_uuid())`,
        [entity.PartitionKey, entity.RowKey, entity],
      );
    });
  }
};

module.exports = writeToPostgres;
