#!/usr/bin/env node

const workerTypesList = require('../etc/worker-types.json');
const amis = require('../../docker-worker-amis.json');
const jsonfile = require('jsonfile');
const utils = require('./worker_type_utils');
const _ = require('lodash');

/*
 * Write worker-types configuration to a json file
 */
function backupWorkerTypes(client) {
  console.log('Creating worker-types backup file.');
  const names = _.flatten(_.map(workerTypesList, v => v));
  const workerTypes = names.map(name => {
    const w = new utils.WorkerType(client, name);
    return w.workerType();
  });

  return Promise.all(workerTypes).then(
    result => new Promise((resolve, reject) => jsonfile.writeFile(
      'worker-types-backup.json',
      result,
      { spaces: 2 },
      err => err ? reject(err) : resolve()
    ))
  );
}

function updateWorkerTypes(client) {
  console.log('Updating worker types...');
  const p = Object.keys(workerTypesList).map(i => {
    return workerTypesList[i].map(async name => {
      const workerType = new utils.WorkerType(client, name);
      const wt = await workerType.workerType();

      for (region of wt.regions) {
        region.launchSpec.ImageId = amis[i][region.region];
      }
      console.log(`Updating ${name}`);
      return workerType.update(wt);
    });
  });

  return Promise.all(_.flatten(p));
}

function main() {
  const client = utils.createClient();
  return backupWorkerTypes(client).then(
    () => updateWorkerTypes(client)
  );
}

main().catch(err => console.log(err.stack));
