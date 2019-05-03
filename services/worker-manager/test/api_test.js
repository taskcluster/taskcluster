const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.workerManager.ping();
  });

  const workerTypeCompare = (name, input, result, deletion = false) => {
    const {created, lastModified, scheduledForDeletion, ...definition} = result;
    assert(created);
    assert(lastModified);
    assert(scheduledForDeletion === deletion);
    assert.deepEqual({name, ...input}, definition);
  };

  test('create workertype', async function() {
    const name = 'ee';
    const input = {
      provider: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
    };
    workerTypeCompare(name, input, await helper.workerManager.createWorkerType(name, input));
    const name2 = 'ee2';
    const input2 = {
      provider: 'testing1',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
    };
    workerTypeCompare(name2, input2, await helper.workerManager.createWorkerType(name2, input2));
  });

  test('update workertype', async function() {
    const name = 'ee';
    const input = {
      provider: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
    };
    const initial = await helper.workerManager.createWorkerType(name, input);
    workerTypeCompare(name, input, initial);
    const input2 = {
      provider: 'testing2',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
    };
    const updated = await helper.workerManager.updateWorkerType(name, input2);
    workerTypeCompare(name, input2, updated);

    assert.equal(initial.lastModified, initial.created);
    assert.equal(initial.created, updated.created);
    assert(updated.lastModifed !== updated.created);
  });

  test('create workertype (invalid provider)', async function() {
    try {
      await helper.workerManager.createWorkerType('oo', {
        provider: 'foo',
        description: 'e',
        config: {},
        owner: 'example@example.com',
      });
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid provider');
  });

  test('update workertype (invalid provider)', async function() {
    await helper.workerManager.createWorkerType('oo', {
      provider: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
    });
    try {
      await helper.workerManager.updateWorkerType('oo', {
        provider: 'foo',
        description: 'e',
        config: {},
        owner: 'example@example.com',
      });
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid provider');
  });

  test('create workertype (already exists)', async function() {
    await helper.workerManager.createWorkerType('oo', {
      provider: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
    });
    try {
      await helper.workerManager.createWorkerType('oo', {
        provider: 'testing2',
        description: 'e',
        config: {},
        owner: 'example@example.com',
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
      await helper.workerManager.updateWorkerType('oo', {
        provider: 'testing1',
        description: 'e',
        config: {},
        owner: 'example@example.com',
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
    const name = 'ee';
    const input = {
      provider: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
    };
    await helper.workerManager.createWorkerType(name, input);
    workerTypeCompare(name, input, await helper.workerManager.workerType(name));
  });

  test('get workertype (does not exist)', async function() {
    try {
      await helper.workerManager.workerType('oo');
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('get of non-existent workertype succeeded');
  });

  test('delete workertype', async function() {
    const name = 'ee';
    const input = {
      provider: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
    };
    workerTypeCompare(name, input, await helper.workerManager.createWorkerType(name, input));
    await helper.workerManager.deleteWorkerType(name);
    workerTypeCompare(name, input, await helper.workerManager.workerType(name), true);
  });

  test('credentials google', async function() {
    const name = 'ee';
    const input = {
      provider: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
    };
    workerTypeCompare(name, input, await helper.workerManager.createWorkerType(name, input));
    await helper.workerManager.credentialsGoogle(name, {token: 'abc'});
  });
});
