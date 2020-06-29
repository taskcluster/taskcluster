const sinon = require('sinon');
const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const helper = require('./helper');
const {CloudAPI} = require('../src/providers/cloudapi');

suite(testing.suiteName(), function() {
  let cloud;

  setup(async function() {
    const _backoffDelay = 1;
    cloud = new CloudAPI({
      types: ['query', 'get', 'list', 'opRead'],
      apiRateLimits: {},
      intervalDefault: 100 * 1000,
      intervalCapDefault: 2000,
      monitor: await helper.load('monitor'),
      providerId: 'fake-provider',
      errorHandler: ({err, tries}) => {
        if (err.code === 403) { // for testing purposes, 403 = rate limit
          return {
            backoff: _backoffDelay * 50,
            reason: 'rateLimit',
            level: 'notice',
          };
        } else if (err.code === 403 || err.code >= 500) {
          return {
            backoff: _backoffDelay * Math.pow(2, tries),
            reason: 'errors',
            level: 'warning',
          };
        }
        throw err;
      },
    });
  });

  test('non existing queue', async function() {
    try {
      await cloud.enqueue('nonexisting', () => {});
    } catch (err) {
      assert.equal(err.message, 'Unknown p-queue attempted: nonexisting');
      return;
    }
    throw new Error('should have thrown an error');
  });

  test('simple', async function() {
    const result = await cloud.enqueue('query', () => 5);
    assert.equal(result, 5);
  });

  test('one 500', async function() {
    const remote = sinon.stub();
    remote.onCall(0).throws({code: 500});
    remote.onCall(1).returns(10);
    const result = await cloud.enqueue('query', () => remote());
    assert.equal(result, 10);
    assert.equal(remote.callCount, 2);
  });
  test('multiple 500', async function() {
    const remote = sinon.stub();
    remote.onCall(0).throws({code: 500});
    remote.onCall(1).throws({code: 520});
    remote.onCall(2).throws({code: 503});
    remote.onCall(3).returns(15);
    const result = await cloud.enqueue('query', () => remote());
    assert.equal(result, 15);
    assert.equal(remote.callCount, 4);
  });
  test('500s forever should throw', async function() {
    const remote = sinon.stub();
    remote.throws({code: 500});

    try {
      await cloud.enqueue('query', () => remote());
    } catch (err) {
      assert.deepEqual(err, {code: 500});
      return;
    }
    assert.equal(remote.callCount, 5);
    throw new Error('should have thrown an error');
  });
});
