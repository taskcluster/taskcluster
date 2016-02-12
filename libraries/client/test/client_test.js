suite('client requests/responses', function() {
  var base            = require('taskcluster-base');
  var taskcluster     = require('../');
  var assert          = require('assert');
  var path            = require('path');
  var debug           = require('debug')('test:client');
  var request         = require('superagent-promise');
  var _               = require('lodash');
  var nock            = require('nock');

  // This suite exercises the request and response functionality of
  // the client against a totally fake service defined by this reference
  // and implemented via Nock.
  var reference = {
    version: 0,
    $schema: "http://schemas.taskcluster.net/base/v1/api-reference.json#",
    title: "Fake API",
    description: "Fake API",
    baseUrl: "https://fake.taskcluster.net/v1",
    entries: [
      {
        type: "function",
        method: "get",
        route: "/get-test",
        query: [],
        args: [],
        name: "get",
        stability: "experimental",
        title: "Test Get",
        description: "Place we can call to test GET",
        scopes: [],
      },
      {
        type: "function",
        method: "post",
        route: "/post-test",
        query: [],
        args: [],
        name: "post",
        stability: "experimental",
        title: "Test Post",
        description: "Place we can call to test POST",
        scopes: [],
        input: "http://schemas.taskcluster.net/nothing.json"
      },
      {
        type: "function",
        method: "post",
        route: "/post-param/<param>",
        query: [],
        args: ['param'],
        name: "postParam",
        stability: "experimental",
        title: "Test Post Param",
        description: "Place we can call to test POST with params",
        scopes: [],
        input: "http://schemas.taskcluster.net/nothing.json"
      },
      {
        type: "function",
        method: "post",
        route: "/post-param-query/<param>",
        query: ['option'],
        args: ['param'],
        name: "postParamQuery",
        stability: "experimental",
        title: "Test Post Param Query",
        description: "Place we can call to test POST with params and a query",
        scopes: [],
        input: "http://schemas.taskcluster.net/nothing.json"
      },
      {
        type: "function",
        method: "get",
        route: "/url-param/<param>/list",
        query: [],
        args: ['param'],
        name: "param",
        stability: "experimental",
        title: "Test Params",
        description: "Place we can call to test url parameters",
        scopes: [],
      },
      {
        type: "function",
        method: "get",
        route: "/url-param2/<param1>/<param2>/list",
        query: [],
        args: ['param1', 'param2'],
        name: "param2",
        stability: "experimental",
        title: "Test Params",
        description: "Place we can call to test url parameters",
        scopes: [],
      },
      {
        type: "function",
        method: "get",
        route: "/query/test",
        query: ['option'],
        args: [],
        name: "query",
        stability: "experimental",
        title: "Test Query string options",
        description: "Place we can call to test query string",
        scopes: [],
      },
      {
        type: "function",
        method: "get",
        route: "/param-query/<param>",
        query: ['option'],
        args: ['param'],
        name: "paramQuery",
        stability: "experimental",
        title: "Test Query string options with params",
        description: "Place we can call to test query string with params",
        scopes: [],
      }
    ],
  };

  teardown(function() {
    let pending = nock.pendingMocks();
    assert.deepEqual(pending, []);
  });

  let Fake = taskcluster.createClient(reference);
  let client = new Fake({
    credentials: {
      // note that nothing in this suite actually verifies these, but it
      // exercises the request-signing code
      clientId: 'nobody',
      accessToken: 'nothing',
    },
  });

  let insufficientScopesError = {
    code: "InsufficientScopes",
    message: "You do not have sufficient scopes.",
    requestInfo: {},
    details: {},
  };

  let authFailedError = {
    code: "AuthorizationFailed",
    message: "Authorization Failed",
    error: {
      info: "None of the scope-sets was satisfied",
      scopesets: [["gotta-get:foo"]],
      scopes: []
    }
  };

  let expectError = (promise, code) => {
    return promise.then(() => {
      assert(false, 'Expected error code: ' + code + ', but got a response');
    }, err => {
      assert(err.code === code, 'Expected error with code: ' + code + ' but got ' + err.code);
    });
  };

  test('Simple GET', async () => {
    nock('https://fake.taskcluster.net').get('/v1/get-test')
      .reply(200, {})
    await client.get();
  });

  test('Simple GET (unauthorized)', async () => {
    nock('https://fake.taskcluster.net').get('/v1/get-test')
      .reply(403, insufficientScopesError);
    await expectError(client.get(), 'InsufficientScopes');
  });

  test('Simple GET (wrong accessToken)', async () => {
    nock('https://fake.taskcluster.net').get('/v1/get-test')
      .reply(403, authFailedError);
    await expectError(client.get(), 'AuthorizationFailed');
  });

  test('GET with parameter', async () => {
    nock('https://fake.taskcluster.net').get('/v1/url-param/test/list')
      .reply(200, {params: {param: 'test'}});
    let result = await client.param('test');
    assert(result.params.param === 'test');
  });

  test('GET with number as parameter', async () => {
    nock('https://fake.taskcluster.net').get('/v1/url-param/1337/list')
      .reply(200, {params: {param: '1337'}});
    await client.param(1337);
  });

  test('GET with / in parameter', async () => {
    nock('https://fake.taskcluster.net').get('/v1/url-param/te%2Fst/list')
      .reply(200, {params: {param: 'te/st'}});
    await client.param('te/st');
  });

  test('GET with two parameters', async () => {
    nock('https://fake.taskcluster.net').get('/v1/url-param2/te%2Fst/tester/list')
      .reply(200, {params: {param: 'te/st'}});
    await client.param2('te/st', 'tester');
  });

  test('GET with query options', async () => {
    nock('https://fake.taskcluster.net').get('/v1/query/test?option=42')
      .reply(200, {});
    await client.query({option: 42});
  });

  test('GET with param and query options', async () => {
    nock('https://fake.taskcluster.net').get('/v1/param-query/test?option=42')
      .reply(200, {});
    await client.paramQuery('test', {option: 42});
  });

  test('GET with missing parameter, but query options', async () => {
    try {
      await client.paramQuery({option: 42});
    } catch(err) {
      return;
    }
    assert(false, "Expected an error");
  });

  test('GET without query options (for supported method)', async () => {
    nock('https://fake.taskcluster.net').get('/v1/query/test')
      .reply(200, {});
    await client.query();
  });

  test('GET param without query options (for supported method)', async () => {
    nock('https://fake.taskcluster.net').get('/v1/param-query/test')
      .reply(200, {});
    await client.paramQuery('test');
  });

  test('GET with baseUrl', async () => {
    nock('https://fake-staging.taskcluster.net').get('/v1/get-test')
      .reply(200, {});
    let client = new Fake({baseUrl: 'https://fake-staging.taskcluster.net/v1'});
    await client.get();
  });

  test('GET with baseUrl (404)', async () => {
    nock('https://fake-staging.taskcluster.net').get('/v1/get-test')
      .reply(404, {code: 'NotFoundError'});
    let client = new Fake({baseUrl: 'https://fake-staging.taskcluster.net/v1'});
    await client.get().then(() => assert('false'), err => {
      assert(err.statusCode === 404);
    });
  });

  test('GET public resource', async () => {
    nock('https://fake.taskcluster.net').get('/v1/get-test')
      .reply(200, {})
    let c = new Fake();
    await c.get();
  });

  test('GET public resource with query-string', async () => {
    nock('https://fake.taskcluster.net').get('/v1/query/test?option=31')
      .reply(200, {})
    let c = new Fake();
    await c.query({option: 31});
  });

  test('GET public resource no query-string (supported method)', async () => {
    nock('https://fake.taskcluster.net').get('/v1/query/test')
      .reply(200, {})
    let c = new Fake();
    await c.query();
  });

  test('POST with payload', async () => {
    nock('https://fake.taskcluster.net')
      .post('/v1/post-test', {hello: 'world'})
      .reply(200, {reply: 'hi'})
    let result = await client.post({hello: 'world'});
    assert.deepEqual(result, {reply: 'hi'});
  });

  test('POST with payload and param', async () => {
    nock('https://fake.taskcluster.net')
      .post('/v1/post-param/test', {hello: 'world'})
      .reply(200, {});
    await client.postParam('test', {hello: 'world'});
  });

  test('POST with payload, param and query', async () => {
    nock('https://fake.taskcluster.net')
      .post('/v1/post-param-query/test?option=32', {hello: 'world'})
      .reply(200, {});
    await client.postParamQuery('test', {hello: 'world'}, {
      option: 32
    });
  });

  test('POST with payload, param and no query (when supported)', async () => {
    nock('https://fake.taskcluster.net')
      .post('/v1/post-param-query/test', {hello: 'world'})
      .reply(200, {});
    await client.postParamQuery('test', {hello: 'world'});
  });

  test('POST with payload, param and empty query', async () => {
    nock('https://fake.taskcluster.net')
      .post('/v1/post-param-query/test', {hello: 'world'})
      .reply(200, {});
    await client.postParamQuery('test', {hello: 'world'}, {});
  });

  test('Report stats', async () => {
    let record = null;
    let client = new Fake({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret'
      },
      stats: function(r) {
        assert(record === null, "Got two stats records!");
        record = r;
      }
    });
    // Inspect the credentials
    nock('https://fake.taskcluster.net').get('/v1/get-test')
      .reply(200, {})
    await client.get();
    assert(record.duration > 0, "Error in record.duration");
    assert(record.retries === 0, "Error in record.retries");
    assert(record.method === 'get', "Error in record.method");
    assert(record.success === 1, "Error in record.success");
    assert(record.resolution === 'http-200', "Error in record.resolution");
    assert(record.target === 'Unknown', "Error in record.target");
    assert(record.baseUrl, "Error in record.baseUrl");
  });

  test('Report stats (unauthorized)', async () => {
    let record = null;
    let client = new Fake({
      credentials: {
        clientId:     'tester',
        accessToken:  'wrong'
      },
      stats: function(r) {
        assert(record === null, "Got two stats records!");
        record = r;
      }
    });
    // Inspect the credentials
    nock('https://fake.taskcluster.net').get('/v1/get-test')
      .reply(401, authFailedError);
    await expectError(client.get(), 'AuthorizationFailed');
    assert(record.duration > 0, "Error in record.duration");
    assert(record.retries === 0, "Error in record.retries");
    assert(record.method === 'get', "Error in record.method");
    assert(record.success === 0, "Error in record.success");
    assert(record.resolution === 'http-401', "Error in record.resolution");
    assert(record.target === 'Unknown', "Error in record.target");
    assert(record.baseUrl, "Error in record.baseUrl");
  });

  test('BuildUrl', async () => {
    let url = client.buildUrl(client.get);
    assert.equal(url, 'https://fake.taskcluster.net/v1/get-test');
  });

  test('BuildUrl with parameter', async () => {
    let url = client.buildUrl(client.param, 'test');
    assert.equal(url, 'https://fake.taskcluster.net/v1/url-param/test/list');
  });

  test('BuildUrl with two parameters', async () => {
    let url = client.buildUrl(client.param2, 'test', 'te/st');
    assert.equal(url, 'https://fake.taskcluster.net/v1/url-param2/test/te%2Fst/list');
  });

  test('BuildUrl with missing parameter', async () => {
    try {
      client.buildUrl(client.param2, 'te/st');
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('BuildUrl with query-string', async () => {
    let url = client.buildUrl(client.query, {option: 2});
    assert.equal(url, 'https://fake.taskcluster.net/v1/query/test?option=2');
  });

  test('BuildUrl with empty query-string', async () => {
    let url = client.buildUrl(client.query, {});
    assert.equal(url, 'https://fake.taskcluster.net/v1/query/test');
  });

  test('BuildUrl with query-string (wrong key)', async () => {
    try {
      client.buildUrl(client.query, {wrongKey: 2});
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('BuildUrl with param and query-string', async () => {
    let url = client.buildUrl(client.paramQuery, 'test', {option: 2});
    assert.equal(url, 'https://fake.taskcluster.net/v1/param-query/test?option=2');
  });

  test('BuildUrl with param and no query (when supported)', async () => {
    let url = client.buildUrl(client.paramQuery, 'test', {option: 34});
    assert.equal(url, 'https://fake.taskcluster.net/v1/param-query/test?option=34');
  });

  test('BuildUrl with param and empty query', async () => {
    let url = client.buildUrl(client.paramQuery, 'test', {});
    assert.equal(url, 'https://fake.taskcluster.net/v1/param-query/test');
  });

  test('BuildUrl with missing parameter, but query options', async () => {
    try {
      client.buildUrl(client.paramQuery, {option: 2});
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('BuildUrl for missing method', async () => {
    try {
      client.buildUrl('test');
    } catch (err) {
      return;
    }
    assert(false);
  });
});
