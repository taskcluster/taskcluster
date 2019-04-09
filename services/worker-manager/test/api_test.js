const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.workerManager.ping();
  });

  const workerTypeCompare = (name, input, result, desiredRenderedConfig = {}) => {
    const {created, lastModified, renderedConfig, ...definition} = result;
    assert(created);
    assert(lastModified);
    assert.equal(lastModified, created);
    assert.deepEqual(renderedConfig, desiredRenderedConfig);
    assert.deepEqual({name, ...input}, definition);
  };

  test('create workertype', async function() {
    const name = 'ee';
    const input = {
      provider: 'foo',
      description: 'bar',
      configTemplate: {},
    };
    workerTypeCompare(name, input, await helper.workerManager.createWorkerType(name, input));
    const name2 = 'ee2';
    const input2 = {
      provider: 'baz',
      description: 'bing',
      configTemplate: {},
    };
    workerTypeCompare(name2, input2, await helper.workerManager.createWorkerType(name2, input2));
  });

  test('update workertype', async function() {
    const name = 'ee';
    const input = {
      provider: 'foo',
      description: 'bar',
      configTemplate: {},
    };
    workerTypeCompare(name, input, await helper.workerManager.createWorkerType(name, input));
    const input2 = {
      provider: 'baz',
      description: 'bing',
      configTemplate: {},
    };
    workerTypeCompare(name, input2, await helper.workerManager.updateWorkerType(name, input2));
  });

  test('create workertype (already exists)', async function() {
    await helper.workerManager.createWorkerType('oo', {
      provider: 'q',
      description: 'e',
      configTemplate: {},
    });
    try {
      await helper.workerManager.createWorkerType('oo', {
        provider: 'q',
        description: 'e',
        configTemplate: {},
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
        provider: 'q',
        description: 'e',
        configTemplate: {},
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
      provider: 'foo',
      description: 'bar',
      configTemplate: {},
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
      provider: 'foo',
      description: 'bar',
      configTemplate: {},
    };
    workerTypeCompare(name, input, await helper.workerManager.createWorkerType(name, input));
    await helper.workerManager.deleteWorkerType(name);
    try {
      await helper.workerManager.workerType(name);
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('get of a deleted workertype succeeded');
  });
});
