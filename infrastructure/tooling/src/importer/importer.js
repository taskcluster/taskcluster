const { Database } = require('taskcluster-lib-postgres');
const buffer = require('buffered-async-iterator');
const { Operation } = require('./operations');
const { Table, Blob } = require('fast-azure-storage');
const glob = require('glob');
const {postgresTableName} = require('taskcluster-lib-entities');
const {REPO_ROOT, readRepoYAML} = require('../utils');
const { readAzureTableInChunks, writeToPostgres, ALLOWED_TABLES, CRYPTO_TABLES, LARGE_TABLES, TASKID_RANGES } = require('./util');

const createOperations = async ({operations, config, monitor}) => {
  const credentials = {
    azure: {
      accountId: config.AZURE_ACCOUNT,
      accessKey: config.AZURE_ACCOUNT_KEY,
    },
  };

  const db = new Database({
    urlsByMode: {admin: config.ADMIN_DB_URL},
    statementTimeout: false,
    poolSize: config.CONCURRENCY,
  });

  await makeTableOperations({operations, config, monitor, credentials, db});
  await makeContainerOperations({operations, config, monitor, credentials, db});
};

const makeTableOperations = async ({operations, config, monitor, credentials, db}) => {
  const tableNames = [];
  for (let path of glob.sync('services/*/azure.yml', {cwd: REPO_ROOT})) {
    const azureYml = await readRepoYAML(path);
    for (let t of azureYml.tables || []) {
      tableNames.push(t);
    }
  }

  const allowedTables = new Set();
  for (let t of ALLOWED_TABLES) {
    allowedTables.add(t);
  }
  if (config.EXCLUDE_CRYPTO) {
    for (let t of CRYPTO_TABLES) {
      allowedTables.delete(t);
    }
  }

  // support truncating each table exactly once
  const truncated = {};
  const truncateTable = tableName => {
    if (!truncated[tableName]) {
      truncated[tableName] = (async () => {
        const pgTable = postgresTableName(tableName);
        await db._withClient('admin', async client => {
          await client.query(`truncate ${pgTable}`);
        });
      })();
    }
    return truncated[tableName];
  };

  for (let tableName of tableNames) {
    if (!allowedTables.has(tableName)) {
      continue;
    }
    if (LARGE_TABLES.includes(tableName)) {
      for (let range of TASKID_RANGES) {
        operations.add(new TableOperation({tableName, range, db, credentials, truncateTable}));
      }
    } else {
      operations.add(new TableOperation({tableName, db, credentials, truncateTable}));
    }
  }
};

class TableOperation extends Operation {
  constructor({tableName, range, db, credentials, truncateTable}) {
    super({title: `${tableName} table`});
    this.tableName = tableName;
    this.db = db;
    this.credentials = credentials;
    this.truncateTable = truncateTable;

    if (range) {
      const [from, to] = range;
      if (from && to) {
        this.filter = `PartitionKey ${Table.Operators.GreaterThanOrEqual} ${Table.Operators.string(from)} ${Table.Operators.And} PartitionKey ${Table.Operators.LessThan} ${Table.Operators.string(to)}`;
        this.title = `${this.title} ${from} ≤ taskId < ${to}`;
      } else if (from && !to) {
        this.filter = `PartitionKey ${Table.Operators.GreaterThanOrEqual} ${Table.Operators.string(from)}`;
        this.title = `${this.title} ${from} ≤ taskId`;
      } else if (!from && to) {
        this.filter = `PartitionKey ${Table.Operators.LessThan} ${Table.Operators.string(to)}`;
        this.title = `${this.title} taskId < ${to}`;
      } else {
        throw new Error('weird range');
      }
    } else {
      this.filter = undefined;
    }
  }

  async run() {
    await this.truncateTable(this.tableName);
    this.rowsProcessed(0);

    const BATCH_SIZE = 1000;
    const BUFFER_SIZE = 2000;

    let chunk = [];
    let buf = buffer(
      readAzureTableInChunks({
        azureCreds: this.credentials.azure,
        tableName: this.tableName,
        filter: this.filter,
      }),
      BUFFER_SIZE);
    for await (let entity of buf) {
      this.bufferSize = `${Math.floor(buf.length / BUFFER_SIZE * 100)}%`;
      chunk.push(entity);

      // do inserts in batches of BATCH_SIZE
      if (chunk.length >= BATCH_SIZE) {
        await writeToPostgres(this.tableName, chunk, this.db);
        this.rowsProcessed(chunk.length);
        chunk = [];
      }
    }
    if (chunk.length > 0) {
      await writeToPostgres(this.tableName, chunk, this.db);
      this.rowsProcessed(chunk.length);
    }
  }
}

const makeContainerOperations = async ({operations, config, monitor, credentials, db}) => {
  if (!ALLOWED_TABLES.includes('Roles')) {
    return;
  }
  operations.add(new RolesOperation({db, credentials}));
};

class RolesOperation extends Operation {
  constructor({db, credentials}) {
    super({title: `Roles blob`});
    this.db = db;
    this.credentials = credentials;
  }

  async run() {
    const pgTable = postgresTableName('Roles');
    await this.db._withClient('admin', async client => {
      await client.query(`truncate ${pgTable}`);
    });

    this.rowsProcessed(0);

    const container = new Blob(this.credentials.azure);
    let blobInfo = await container.getBlob('auth-production-roles', 'Roles', {});
    let {content: blobContent} = blobInfo;
    let {content: roles} = JSON.parse(blobContent);

    // this is a little tricky, but we *manully* create a single "entity" that can be imported
    // into postgres
    const entity = {
      RowKey: 'role',
      PartitionKey: 'role',
      __bufchunks_blob: 1,
      __buf0_blob: Buffer.from(JSON.stringify(roles)).toString('base64'),
    };

    await writeToPostgres('Roles', [entity], this.db);

    this.rowsProcessed(1);
  }
}
exports.createOperations = createOperations;
