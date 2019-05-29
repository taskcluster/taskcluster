const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.workerManager.ping();
  });

  const workerPoolCompare = (workerPoolId, input, result, deletion = false) => {
    const {created, lastModified, scheduledForDeletion, ...definition} = result;
    assert(created);
    assert(lastModified);
    assert(scheduledForDeletion === deletion);
    assert.deepStrictEqual({workerPoolId, ...input}, definition);
  };

  test('create worker pool', async function() {
    const workerPoolId = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId, input,
      await helper.workerManager.createWorkerPool(workerPoolId, input));
    const workerPoolId2 = 'pp/ee2';
    const input2 = {
      providerId: 'testing1',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId2, input2,
      await helper.workerManager.createWorkerPool(workerPoolId2, input2));
  });

  test('update worker pool', async function() {
    const workerPoolId = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    const initial = await helper.workerManager.createWorkerPool(workerPoolId, input);
    workerPoolCompare(workerPoolId, input, initial);
    const input2 = {
      providerId: 'testing2',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    const updated = await helper.workerManager.updateWorkerPool(workerPoolId, input2);
    workerPoolCompare(workerPoolId, input2, updated);

    assert.equal(initial.lastModified, initial.created);
    assert.equal(initial.created, updated.created);
    assert(updated.lastModifed !== updated.created);
  });

  test('create worker pool (invalid providerId)', async function() {
    try {
      await helper.workerManager.createWorkerPool('pp/oo', {
        providerId: 'foo',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid providerId');
  });

  test('update worker pool (invalid providerId)', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.updateWorkerPool('pp/oo', {
        providerId: 'foo',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid providerId');
  });

  test('create worker pool (already exists)', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.createWorkerPool('pp/oo', {
        providerId: 'testing2',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'RequestConflict') {
        throw err;
      }
      return;
    }
    throw new Error('creation of an already existing worker pool succeeded');
  });

  test('update worker pool (does not exist)', async function() {
    try {
      await helper.workerManager.updateWorkerPool('pp/oo', {
        providerId: 'testing1',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('update of non-existent worker pool succeeded');
  });

  test('get worker pool', async function() {
    const workerPoolId = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);
    workerPoolCompare(workerPoolId, input, await helper.workerManager.workerPool(workerPoolId));
  });

  test('get worker pool (does not exist)', async function() {
    try {
      await helper.workerManager.workerPool('pp/oo');
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('get of non-existent worker pool succeeded');
  });

  test('delete worker pool', async function() {
    const workerPoolId = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId, input,
      await helper.workerManager.createWorkerPool(workerPoolId, input));
    await helper.workerManager.deleteWorkerPool(workerPoolId);
    workerPoolCompare(workerPoolId, input,
      await helper.workerManager.workerPool(workerPoolId), true);
  });

  test('delete worker pool (does not exist)', async function() {
    try {
      await helper.workerManager.deleteWorkerPool('pp/whatever');
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('delete of non-existent worker pool succeeded');
  });

  test('get worker pools', async function() {
    const workerPoolId = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);
    let data = await helper.workerManager.listWorkerPools();

    data.workerPools.forEach( wt => {
      workerPoolCompare(workerPoolId, input, wt);
    });
  });

  test('get worker pools - no worker pools in db', async function() {
    let data = await helper.workerManager.listWorkerPools();

    assert.deepStrictEqual(data.workerPools, [], 'Should return an empty array of worker pools');
  });

  const googleInput = {
    providerId: 'google',
    description: 'bar',
    config: {
      minCapacity: 1,
      maxCapacity: 1,
      capacityPerInstance: 1,
      machineType: 'n1-standard-2',
      regions: ['us-east1'],
      userData: {},
      scheduling: {},
      networkInterfaces: [],
      disks: [],
    },
    owner: 'example@example.com',
    emailOnError: false,
  };

  test('create (google) worker pool', async function() {
    const workerPoolId = 'pp/ee';
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
  });

  test('credentials google', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'abc123',
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
  });

  test('credentials google (but wrong worker)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'gcp',
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong worker!');
  });

  test('credentials google (but wrong worker pool)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId: 'wrong',
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong worker pool!');
  });

  test('credentials google (second fetch fails)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));

    await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed second fetch of creds');
  });
});
