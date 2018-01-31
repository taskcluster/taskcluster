#!/usr/bin/env node

const workerTypesListProd = require('../etc/worker-types.json');
const workerTypesListTest = require('../etc/worker-types-test.json');
const amis = require('../../docker-worker-amis.json');
const jsonfile = require('jsonfile');
const utils = require('./worker_type_utils');
const _ = require('lodash');
const program = require('commander');

program
  .option('--no-backup', 'Don\'t generate the backup file.')
  .option('-t, --test', 'Update only test worker types.')
  .parse(process.argv);

const workerTypesList = program.test
  ? workerTypesListTest
  : workerTypesListProd;

/*
 * Backup worker-types regions config
 */
function backupWorkerTypes(client) {
  if (!program.backup) {
    return Promise.resolve();
  }

  console.log('Creating worker-types backup file.');
  const names = _.flatten(_.map(workerTypesList, v => v));
  const workerTypes = names.map(name => {
    const w = new utils.WorkerType(client, name);
    return w.workerType();
  });

  return Promise.all(workerTypes).then(
    result => new Promise((resolve, reject) => jsonfile.writeFile(
      'worker-types-backup.json',
      result
        .map(({workerType, regions}) => ({ [workerType]: regions }))
        .reduce((o, w) => _.merge(o, w), {}),
      { spaces: 2 },
      err => err ? reject(err) : resolve()
    ))
  );
}

async function updateWorkerTypes(client) {
  console.log('Updating worker types...');
  for (let i of Object.keys(workerTypesList)) {
    for (let name of workerTypesList[i]) {
      const workerType = new utils.WorkerType(client, name);
      const wt = await workerType.workerType();

      for (let region of wt.regions) {
        region.launchSpec.ImageId = amis[i][region.region];
      }
      console.log(`Updating ${name}`);
      await new Promise(accept => setTimeout(accept, 200));
      await workerType.update(wt);
    }
  }
}

function main() {
  const client = utils.createClient();
  return backupWorkerTypes(client).then(
    () => updateWorkerTypes(client)
  );
}

main().catch(err => console.log(err.stack));
