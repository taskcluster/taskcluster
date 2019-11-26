const _ = require('lodash');
const split = require('split');
const util = require('util');
const zlib = require('zlib');
const azure = require('fast-azure-storage');
const {pipeline, Writable} = require('stream');
const {fail, parseResource, parse} = require('./util');

const restoreTasks = async ({azureCreds, s3, bucket, resource, destination, versionId}) => {
  if (!destination) {
    destination = resource;
  }

  const [type, name] = parseResource(resource);
  const [dtype, dname] = parseResource(destination);

  if (type !== dtype) {
    return fail(`Can't restore to a different type of resource (${type} -> ${dtype})`);
  }

  const tasks = [];
  if (type === 'table') {
    tasks.push({
      title: `Restore Table ${name} to ${dname}`,
      locks: ['concurrency'],
      requires: [],
      provides: [],
      run: async (requirements, utils) => {
        await restoreTable({
          azureCreds,
          s3,
          bucket,
          tableName: name,
          destTableName: dname,
          versionId,
          utils});
      },
    });
  } else if (type === 'container') {
    tasks.push({
      title: `Restore Container ${name} to ${dname}`,
      locks: ['concurrency'],
      requires: [],
      provides: [],
      run: async (requirements, utils) => {
        await restoreContainer({
          azureCreds,
          s3,
          bucket,
          containerName: name,
          destContainerName: dname,
          versionId,
          utils});
      },
    });
  } else {
    return fail(`Unknown resource type ${type}`);
  }

  return tasks;
};

let restoreTable = async ({azureCreds, s3, bucket, tableName, destTableName, versionId, utils}) => {
  let table = new azure.Table(azureCreds);

  await table.createTable(destTableName).catch(async err => {
    if (err.code !== 'TableAlreadyExists') {
      throw err;
    }
    if ((await table.queryEntities(destTableName, {top: 1})).entities.length > 0) {
      throw new Error(`Refusing to restore table ${tableName} to ${destTableName}, ` +
        'as the destination is not empty!');
    }
  });

  try {
    await s3.headObject({
      Bucket: bucket,
      Key: `${azureCreds.accountId}/table/${tableName}`,
      VersionId: versionId,
    }).promise();
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
    return fail(`no backup found for table ${tableName}`);
  }

  const rowWriter = new Writable({
    objectMode: true,
    writev(chunks, callback) {
      Promise.all(chunks.map(({chunk}) =>
        table.insertEntity(destTableName, chunk)))
        .then(() => callback(), err => callback(err));
    },
  });

  await util.promisify(pipeline)(
    s3.getObject({
      Bucket: bucket,
      Key: `${azureCreds.accountId}/table/${tableName}`,
      VersionId: versionId,
    }).createReadStream(),
    zlib.createGunzip(),
    split(),
    parse(),
    rowWriter);
};

let restoreContainer = async ({azureCreds, s3, bucket, containerName, destContainerName, versionId, utils}) => {
  let blobsvc = new azure.Blob(azureCreds);

  try {
    await blobsvc.createContainer(destContainerName);
  } catch (err) {
    if (err.code !== 'ContainerAlreadyExists') {
      throw err;
    }
    throw new Error(`Refusing to overwrite container ${destContainerName} as it already exists!`);
  }

  try {
    await s3.headObject({
      Bucket: bucket,
      Key: `${azureCreds.accountId}/container/${containerName}`,
      VersionId: versionId,
    }).promise();
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
    return fail(`no backup found for container ${containerName}`);
  }

  const containerWriter = new Writable({
    objectMode: true,
    writev(chunks, callback) {
      Promise.all(chunks.map(({chunk: blob}) => (async () => {
        const res = await blobsvc.putBlob(
          destContainerName,
          blob.name, {
            metadata: blob.info.metadata,
            type: blob.info.type,
          }, blob.info.content);

        // https://github.com/taskcluster/fast-azure-storage/pull/28
        if ((res.contentMd5 || res.contentMD5) !== blob.info.contentMD5) {
          throw new Error(`uploaded MD5 differed from that in backup of /${containerName} blob ${blob.name}`);
        }
      })()))
        .then(() => callback(), err => callback(err));
    },
  });

  await util.promisify(pipeline)(
    s3.getObject({
      Bucket: bucket,
      Key: `${azureCreds.accountId}/container/${containerName}`,
      VersionId: versionId,
    }).createReadStream(),
    zlib.createGunzip(),
    split(),
    parse(),
    containerWriter);
};

module.exports = {restoreTasks};
