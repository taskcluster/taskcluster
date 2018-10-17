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

/**
 * We want to make sure that when a new worker type is added that no other
 * worker configuration has that worker type as well.  The idea is that by
 * storing each worker configuration with its associated list of worker types
 * we reduce overall complexity in the API.  The only case where this is not
 * true is when a new worker type is added to a worker configuration.  We need
 * to ensure that when a new worker type is added that no other worker
 * configuration has that worker type.  The trade here is that 99% of
 * operations on worker configurations are easier to do safely and the 1% of
 * cases (adding a new workerType) is a little more complex.  When we are using
 * a more complex datastore than the InMemoryDatastore, we might be able to
 * track a reverse workerType->workerConfig mapping easily.
 *
 * This function takes a reference to a datastore and a WorkerConfiguration
 * object.
 *
 * Note that the returned information on conflict is non-exhaustive because
 * only information found in the first conflicting worker configuration is
 * returned.  This means that if two new worker types are present each in their
 * own worker configuration, only the one in the first worker configuration is
 * returned
 */
async function workerTypeAlreadyTracked(datastore, workerConfiguration) {
  let workerTypesToCheck = [];
  if (await datastore.has('worker-configurations', workerConfiguration.id)) {
    let oldWorkerConfiguration = await datastore.get('worker-configurations', workerConfiguration.id);
    oldWorkerTypes = buildWorkerConfiguration(oldWorkerConfiguration).workerTypes();
    workerTypesToCheck = workerConfiguration.workerTypes().filter(x => !oldWorkerTypes.includes(x));
  } else {
    workerTypesToCheck = workerConfiguration.workerTypes();
  }

  let allConflicts = [];

  for (let workerConfigurationToCheck of await datastore.list('worker-configurations')) {
    workerConfigurationToCheck = buildWorkerConfiguration(await datastore.get('worker-configurations', workerConfigurationToCheck));
    
    let conflicts = workerConfigurationToCheck.workerTypes().filter(x => workerTypesToCheck.includes(x));

    if (conflicts.length > 0) {
      allConflicts.push({id: workerConfigurationToCheck.id, workerTypes: conflicts});
    }
  }

  if (allConflicts.length > 0) {
    return allConflicts;
  }

  return false;
}

builder.declare({
  method: 'put',
  route: '/worker-configurations/:id',
  name: 'createWorkerConfiguration',
  title: 'Create Worker Configuration',
  stability: APIBuilder.stability.experimental,
  input: 'anything.yml',
  scopes: 'worker-manager:manage-worker-configuration:<id>',
  description: [
    'Create a worker configuration'
  ].join('\n'),
}, async function(req, res) {
  let id = req.params.id;
  // TODO: use res.reportError
  // Validate that the worker type configuration is createable
  let workerConfiguration = buildWorkerConfiguration(req.body);
  if (workerConfiguration.id !== id) {
    return res.reportError('RequestConflict', 'worker configuration id rest parameter must match body');
  }

  let workerTypeConflicts = await workerTypeAlreadyTracked(this.datastore, workerConfiguration);
  if (workerTypeConflicts) {
    return res.reportError('RequestConflict', 'worker type conflicts', {
      conflicts: workerTypeConflicts
    });
  };

  // TODO Idempotency
  await this.datastore.set('worker-configurations', id, req.body);

  res.reply();
});

builder.declare({
  method: 'post',
  route: '/worker-configurations/:id',
  name: 'updateWorkerConfiguration',
  title: 'Update Worker Configuration',
  stability: APIBuilder.stability.experimental,
  scopes: 'worker-manager:manage-worker-configuration:<id>',
  input: 'anything.yml',
  description: [
    'Update a worker configuration'
  ].join('\n'),
}, async function(req, res) {
  let id = req.params.id;

  let workerConfiguration = buildWorkerConfiguration(req.body);
  if (workerConfiguration.id !== id) {
    res.reportError('RequestConflict', 'worker configuration id rest parameter must match body');
  }

  try {
    res.reply(await this.datastore.get('worker-configurations', id));
  } catch (err) {
    if (err instanceof errors.InvalidDatastoreKey) {
      return res.reportError('ResourceNotFound', `${id} is unknown`);
    }
    throw err;
  }

  let workerTypeConflicts = await workerTypeAlreadyTracked(this.datastore, workerConfiguration);
  if (workerTypeConflicts) {
    return res.reportError('RequestConflict', 'worker type conflicts', {
      conflicts: workerTypeConflicts
    });
  };

  await this.datastore.set('worker-configurations', id, req.body);

  res.reply();
});

builder.declare({
  method: 'get',
  route: '/worker-configurations/:id',
  name: 'getWorkerConfiguration',
  title: 'Get Worker Configuration',
  stability: APIBuilder.stability.experimental,
  //output: TODO,
  description: [
    'Get a worker configuration'
  ].join('\n'),
}, async function(req, res) {
  let id = req.params.id;
  try {
    res.reply(await this.datastore.get('worker-configurations', id));
  } catch (err) {
    if (err instanceof errors.InvalidDatastoreKey) {
      return res.reportError('ResourceNotFound', `${id} is unknown`);
    }
    throw err;
  }
});
