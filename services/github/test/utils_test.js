const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const { throttleRequest } = require('../src/utils');

suite(testing.suiteName(), function() {
  suite('throttleRequest', function() {
    let oldRequest;

    suiteSetup(function() {
      oldRequest = throttleRequest.request;
    });

    teardown(function() {
      throttleRequest.request = oldRequest;
    });

    test('calls with the given method and url and returns a success result immediately', async function() {
      throttleRequest.request = async (method, url) => {
        assert.equal(method, 'GET');
        assert.equal(url, 'https://foo');
        return { result: true };
      };

      const res = await throttleRequest({ url: 'https://foo', method: 'GET' });
      assert.deepEqual(res, { result: true });
    });

    test('4xx statuses are returned (not thrown) immediately', async function() {
      let calls = 0;

      throttleRequest.request = async (method, url) => {
        calls++;
        const err = new Error('uhoh');
        err.status = 424;
        throw err;
      };

      const res = await throttleRequest({ url: 'https://foo', method: 'GET' });
      assert.equal(res.status, 424);
      assert.equal(calls, 1); // didn't retry
    });

    test('5xx statuses are retried', async function() {
      let calls = 0;

      throttleRequest.request = async (method, url) => {
        calls++;
        const err = new Error('uhoh');
        err.status = 543;
        throw err;
      };

      // (set delay=10 to retry more quickly than usual)
      const res = await throttleRequest({ url: 'https://foo', method: 'GET', delay: 10 });
      assert.equal(res.status, 543);
      assert.equal(calls, 5);
    });

    test('5xx status retried once returns successful result', async function() {
      let calls = 0;

      throttleRequest.request = async (method, url) => {
        calls++;
        if (calls >= 1) {
          return { status: 200 };
        }
        const err = new Error('uhoh');
        err.status = 543;
        throw err;
      };

      const res = await throttleRequest({ url: 'https://foo', method: 'GET', delay: 10 });
      assert.equal(res.status, 200);
      assert.equal(calls, 1);
    });

    test('connection errors are thrown directly', async function() {
      throttleRequest.request = async (method, url) => {
        const err = new Error('uhoh');
        err.code = 'ECONNREFUSED';
        throw err;
      };

      await assert.rejects(
        () => throttleRequest({ url: 'https://foo', method: 'GET', delay: 10 }),
        err => err.code === 'ECONNREFUSED');
    });
  });
});
