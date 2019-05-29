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

  const workerTypeCompare = (workerTypeName, input, result, deletion = false) => {
    const {created, lastModified, scheduledForDeletion, ...definition} = result;
    assert(created);
    assert(lastModified);
    assert(scheduledForDeletion === deletion);
    assert.deepStrictEqual({workerTypeName, ...input}, definition);
  };

  test('create workertype', async function() {
    const workerTypeName = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerTypeCompare(workerTypeName, input,
      await helper.workerManager.createWorkerType(workerTypeName, input));
    const workerTypeName2 = 'pp/ee2';
    const input2 = {
      providerId: 'testing1',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerTypeCompare(workerTypeName2, input2,
      await helper.workerManager.createWorkerType(workerTypeName2, input2));
  });

  test('update workertype', async function() {
    const workerTypeName = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    const initial = await helper.workerManager.createWorkerType(workerTypeName, input);
    workerTypeCompare(workerTypeName, input, initial);
    const input2 = {
      providerId: 'testing2',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    const updated = await helper.workerManager.updateWorkerType(workerTypeName, input2);
    workerTypeCompare(workerTypeName, input2, updated);

    assert.equal(initial.lastModified, initial.created);
    assert.equal(initial.created, updated.created);
    assert(updated.lastModifed !== updated.created);
  });

  test('create workertype (invalid providerId)', async function() {
    try {
      await helper.workerManager.createWorkerType('pp/oo', {
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

  test('update workertype (invalid providerId)', async function() {
    await helper.workerManager.createWorkerType('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.updateWorkerType('pp/oo', {
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

  test('create workertype (already exists)', async function() {
    await helper.workerManager.createWorkerType('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.createWorkerType('pp/oo', {
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
    throw new Error('creation of an already existing workertype succeeded');
  });

  test('update workertype (does not exist)', async function() {
    try {
      await helper.workerManager.updateWorkerType('pp/oo', {
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
    throw new Error('update of non-existent workertype succeeded');
  });

  test('get workertype', async function() {
    const workerTypeName = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerType(workerTypeName, input);
    workerTypeCompare(workerTypeName, input, await helper.workerManager.workerType(workerTypeName));
  });

  test('get workertype (does not exist)', async function() {
    try {
      await helper.workerManager.workerType('pp/oo');
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('get of non-existent workertype succeeded');
  });

  test('delete workertype', async function() {
    const workerTypeName = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerTypeCompare(workerTypeName, input,
      await helper.workerManager.createWorkerType(workerTypeName, input));
    await helper.workerManager.deleteWorkerType(workerTypeName);
    workerTypeCompare(workerTypeName, input,
      await helper.workerManager.workerType(workerTypeName), true);
  });

  test('delete workertype (does not exist)', async function() {
    try {
      await helper.workerManager.deleteWorkerType('pp/whatever');
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('delete of non-existent workertype succeeded');
  });

  test('get workertypes', async function() {
    const workerTypeName = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerType(workerTypeName, input);
    let data = await helper.workerManager.listWorkerTypes();

    data.workerTypes.forEach( wt => {
      workerTypeCompare(workerTypeName, input, wt);
    });
  });

  test('get workertypes - no workertypes in db', async function() {
    let data = await helper.workerManager.listWorkerTypes();

    assert.deepStrictEqual(data.workerTypes, [], 'Should return an empty array of workertypes');
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

  test('create (google) workertype', async function() {
    const workerTypeName = 'pp/ee';
    workerTypeCompare(workerTypeName, googleInput,
      await helper.workerManager.createWorkerType(workerTypeName, googleInput));
  });

  test('credentials google', async function() {
    const workerTypeName = 'pp/ee';
    await helper.Worker.create({
      workerTypeName,
      workerGroup: 'google',
      workerId: 'abc123',
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerTypeCompare(workerTypeName, googleInput,
      await helper.workerManager.createWorkerType(workerTypeName, googleInput));
    await helper.workerManager.credentialsGoogle(workerTypeName, {token: 'abc'});
  });

  test('credentials google (but wrong worker)', async function() {
    const workerTypeName = 'pp/ee';
    await helper.Worker.create({
      workerTypeName,
      workerGroup: 'google',
      workerId: 'gcp',
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerTypeCompare(workerTypeName, googleInput,
      await helper.workerManager.createWorkerType(workerTypeName, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerTypeName, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong worker!');
  });

  test('credentials google (but wrong workertype)', async function() {
    const workerTypeName = 'pp/ee';
    await helper.Worker.create({
      workerTypeName: 'wrong',
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerTypeCompare(workerTypeName, googleInput,
      await helper.workerManager.createWorkerType(workerTypeName, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerTypeName, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong workertype!');
  });

  test('credentials google (second fetch fails)', async function() {
    const workerTypeName = 'pp/ee';
    await helper.Worker.create({
      workerTypeName,
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerTypeCompare(workerTypeName, googleInput,
      await helper.workerManager.createWorkerType(workerTypeName, googleInput));

    await helper.workerManager.credentialsGoogle(workerTypeName, {token: 'abc'});
    try {
      await helper.workerManager.credentialsGoogle(workerTypeName, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed second fetch of creds');
  });
});
