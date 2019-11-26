const _ = require('lodash');
const zlib = require('zlib');
const glob = require('glob');
const {REPO_ROOT, readRepoYAML} = require('../utils');
const azure = require('fast-azure-storage');
const {fail, parseResource} = require('./util');

const backupTasks = async ({azureCreds, s3, bucket, include, exclude}) => {
  const tasks = [];
  if (include.length > 0 && exclude.length > 0) {
    return fail('Cannot both --include and --exclude');
  }

  let containers = [];
  let tables = [];
  for (let path of glob.sync('services/*/azure.yml', {cwd: REPO_ROOT})) {
    const azureYml = await await readRepoYAML(path);
    for (let c of azureYml.containers || []) {
      containers.push(c);
    }
    for (let t of azureYml.tables || []) {
      tables.push(t);
    }
  }

  if (include.length > 0) {
    const existingTables = new Set(tables);
    const existingContainers = new Set(containers);
    tables = [];
    containers = [];

    for (let rsrc of include) {
      const [type, name] = parseResource(rsrc);

      if (type === 'table') {
        if (existingTables.has(name)) {
          tables.push(name);
        } else {
          return fail(`No such table ${name}`);
        }
      } else if (type === 'container') {
        if (existingContainers.has(name)) {
          containers.push(name);
        } else {
          return fail(`No such container ${name}`);
        }
      } else {
        return fail(`Unknown resource type ${type}`);
      }
    }
  }

  if (exclude.length > 0) {
    const excludeSet = new Set(exclude);
    tables = tables.filter(t => !excludeSet.has(`table/${t}`));
    containers = containers.filter(c => !excludeSet.has(`container/${c}`));
  }

  for (let tableName of tables) {
    tasks.push({
      title: `Back up Table ${tableName}`,
      locks: ['concurrency'],
      requires: [],
      provides: [],
      run: async (requirements, utils) => {
        await backupTable({azureCreds, s3, bucket, tableName, utils});
      },
    });
  }

  for (let containerName of containers) {
    tasks.push({
      title: `Back up Container ${containerName}`,
      locks: ['concurrency'],
      requires: [],
      provides: [],
      run: async (requirements, utils) => {
        await backupContainer({azureCreds, s3, bucket, containerName, utils});
      },
    });
  }

  return tasks;
};

const backupTable = async ({azureCreds, s3, bucket, tableName, utils}) => {
  const stream = new zlib.createGzip();
  const table = new azure.Table(azureCreds);

  // Versioning is enabled in the backups bucket so we just overwrite the
  // previous backup every time. The bucket is configured to delete previous
  // versions after N days, but the current version will never be deleted.
  const upload = s3.upload({
    Bucket: bucket,
    Key: `${azureCreds.accountId}/table/${tableName}`,
    Body: stream,
    StorageClass: 'STANDARD_IA',
  }).promise();

  const processEntities = entities => entities.map(
    entity => stream.write(JSON.stringify(entity) + '\n'));

  let count = 0;
  let nextUpdateCount = 1000;
  let tableParams = {};
  do {
    let results;
    try {
      results = await table.queryEntities(tableName, tableParams);
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
  await upload;
};

const backupContainer = async ({azureCreds, s3, bucket, containerName, utils}) => {
  const stream = new zlib.createGzip();
  const container = new azure.Blob(azureCreds);

  // Versioning is enabled in the backups bucket so we just overwrite the
  // previous backup every time. The bucket is configured to delete previous
  // versions after N days, but the current version will never be deleted.
  let upload = s3.upload({
    Bucket: bucket,
    Key: `${azureCreds.accountId}/container/${containerName}`,
    Body: stream,
    StorageClass: 'STANDARD_IA',
  }).promise();

  let count = 0;
  let nextUpdateCount = 1000;
  let marker;
  do {
    let results = await container.listBlobs(containerName, {marker});
    for (let blob of results.blobs) {
      // NOTE: this only gets *some* of the data associated with the blob; notably,
      // it omits properties
      //   (https://taskcluster.github.io/fast-azure-storage/classes/Blob.html#method-getBlobMetadata)
      // These are not currently used by the azure-blob-storage library
      let blobInfo = await container.getBlob(containerName, blob.name, {});
      stream.write(JSON.stringify({name: blob.name, info: blobInfo}) + '\n');
    }
    marker = results.nextMarker;
    count = count + results.blobs.length;
    if (count > nextUpdateCount) {
      utils.status({
        message: `${count} rows`,
      });
      nextUpdateCount = count + 100;
    }
  } while (marker);

  stream.end();
  await upload;
};

module.exports = {backupTasks};
