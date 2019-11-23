const crypto = require('crypto');
const _ = require('lodash');
const azure = require('fast-azure-storage');
const {fail, parseResource} = require('./util');
const stringify = require('json-stable-stringify');

const compareTasks = async ({azureCreds, resource1, resource2}) => {
  const [type1, name1] = parseResource(resource1);
  const [type2, name2] = parseResource(resource2);

  if (type1 !== type2) {
    return fail(`Can't compare different types of resources (${type1} -> ${type2})`);
  }

  const tasks = [];
  for (let [n, type, name] of [[1, type1, name1], [2, type2, name2]]) {
    if (type === 'table') {
      tasks.push({
        title: `Fetch Table ${name}`,
        locks: ['concurrency'],
        requires: [],
        provides: [`resource${n}`],
        run: async (requirements, utils) => {
          return {
            [`resource${n}`]: await fetchTable({
              azureCreds,
              tableName: name,
              utils}),
          };
        },
      });
    } else if (type === 'container') {
      tasks.push({
        title: `Fetch Container ${name}`,
        locks: ['concurrency'],
        requires: [],
        provides: [`resource${n}`],
        run: async (requirements, utils) => {
          return {
            [`resource${n}`]: await fetchContainer({
              azureCreds,
              containerName: name,
              utils}),
          };
        },
      });
    } else {
      return fail(`Unknown resource type ${type}`);
    }
  }

  tasks.push({
    title: 'Compare',
    requires: ['resource1', 'resource2'],
    provides: ['output'],
    run: async (requirements, utils) => {
      return {
        output: await compareResources(
          resource1,
          requirements['resource1'],
          resource2,
          requirements['resource2'],
          utils),
      };
    },
  });

  return tasks;
};

const hashObject = obj => {
  return crypto.createHash('sha256').update(stringify(obj)).digest('utf-8');
};

const fetchTable = async ({azureCreds, tableName, utils}) => {
  let table = new azure.Table(azureCreds);

  let entities = {};

  const removeFields = [
    'odata.type', // This is the name of the table and so is obviously different
    'odata.id', // This changes based on the name of the table
    'odata.etag', // This changes based on azure-specific timestamps
    'odata.editLink', // This is table specific as well
    'Timestamp', // This is updated by azure itself, but is not used by taskcluster
  ];

  let count = 0;
  let nextUpdateCount = 1000;
  let tableParams = {};
  do {
    let results;
    results = await table.queryEntities(tableName, tableParams);
    tableParams = _.pick(results, ['nextPartitionKey', 'nextRowKey']);
    results.entities.forEach(entity => {
      const ent = _.omit(entity, removeFields);
      const key = hashObject(ent);
      entities[key] = ent;
    });
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

const fetchContainer = async ({azureCreds, containerName, utils}) => {
  let blobsvc = new azure.Blob(azureCreds);

  const entities = {};

  const removeFields = [
    'eTag', // This changes based on azure-specific timestamps
    'lastModified', // This is updated by azure itself, but is not used by taskcluster
  ];

  let count = 0;
  let nextUpdateCount = 1000;
  let marker;
  do {
    let results = await blobsvc.listBlobs(containerName, {marker});
    for (let blob of results.blobs) {
      // NOTE: this only gets *some* of the data associated with the blob; notably,
      // it omits properties
      //   (https://taskcluster.github.io/fast-azure-storage/classes/Blob.html#method-getBlobMetadata)
      // These are not currently used by the azure-blob-storage library
      let blobInfo = await blobsvc.getBlob(containerName, blob.name, {});
      entities[blob.name] = _.omit(removeFields, blobInfo);
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

  return entities;
};

const compareResources = (resource1, entities1, resource2, entities2, utils) => {
  let diffs = 0;
  const [keys1, keys2] = [_.keys(entities1), _.keys(entities2)];
  const [only1, only2] = [_.difference(keys1, keys2).length, _.difference(keys2, keys1).length];

  for (let t of _.intersection(_.keys(entities1), _.keys(entities2))) {
    if (!_.isEqual(entities1[t], entities2[t])) {
      diffs++;
    }
  }

  const [count1, count2] = [_.keys(entities1).length, _.keys(entities2).length];
  return [
    `Number of entities in ${resource1}: ${count1}`,
    `Number of entities in ${resource1} not in ${resource2}: ${only1}`,
    `Number of entities in ${resource2}: ${count2}`,
    `Number of entities in ${resource2} not in ${resource1}: ${only2}`,
    `Number of entities with matching keys that are different between the two: ${diffs}`,
  ].join('\n');
};

module.exports = {compareTasks};
