#!/usr/bin/env node

const utils = require('./worker_type_utils');
const backup = require('../../worker-types-backup.json');
const _ = require('lodash');

async function updateWorkerType(workerType, regions) {
  const definition = await workerType.workerType();
  definition.regions = regions;
  await workerType.update(definition);
  await utils.killInstances(workerType);
}

function main() {
  const client = utils.createClient();

  return Promise.all(_.map(
    backup,
    (regions, name) => {
      console.log(`Updating ${name}`);
      const workerType = new utils.WorkerType(client, name);
      return updateWorkerType(workerType, regions);
    })
  );
}

main().catch(err => console.log(err.stack));

