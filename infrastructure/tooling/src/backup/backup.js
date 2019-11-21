const _ = require('lodash');
const zlib = require('zlib');
const azure = require('fast-azure-storage');

let backupTable = async ({azureCreds, s3, bucket, tableName, utils}) => {
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

let backupContainer = async ({azureCreds, s3, bucket, containerName, utils}) => {
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

module.exports = {backupTable, backupContainer};
