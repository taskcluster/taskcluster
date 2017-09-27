#!/usr/bin/env node

const utils = require('./worker_type_utils');
const backup = require('../../worker-types-backup.json');

function main() {
  const client = utils.createClient();

  return Promise.all(backup.map(
    wt => {
      console.log(`Updating ${wt.workerType}`);
      const workerType = new utils.WorkerType(client, wt.workerType);
      return workerType.update(wt).then(() => utils.killInstances(workerType));
    })
  );
}

main().catch(err => console.log(err.stack));

