const APIBuilder = require('taskcluster-lib-api');
const slugid = require('slugid');

const {buildWorkerConfiguration} = require('./worker-config');
const errors = require('./errors');

let builder = new APIBuilder({
  title: 'TaskCluster Worker Manager',
  description: [
    'This service manages workers, including provisioning',
  ].join('\n'),
  serviceName: 'worker-manager',
  version: 'v1',
  context: [
    'datastore',
  ],
});

module.exports = builder;

