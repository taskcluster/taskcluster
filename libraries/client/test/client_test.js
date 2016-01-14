suite('client', function() {
  var base            = require('taskcluster-base');
  var taskcluster     = require('../');
  var assert          = require('assert');
  var path            = require('path');
  var debug           = require('debug')('test:client');
  var request         = require('superagent-promise');
  var mockserver      = require('./mockserver');

  setup(function() {
    return mockserver.start();
  });

  teardown(function() {
    if (taskcluster.agents.http.destroy) {
      taskcluster.agents.http.destroy();
      taskcluster.agents.https.destroy();
    }
    return mockserver.stop();
  });

  let reference = mockserver.reference();
  let Client = new taskcluster.createClient(reference);
  let client = new Client({
    credentials: {
      clientId:     'tester',
      accessToken:  'secret',
    },
  });
  let nobody = new Client({credentials: {
    clientId: 'nobody', accessToken: 'secret'
  }});
  let wrongKey = new Client({
    credentials: {
      clientId:     'tester',
      accessToken:  'wrong',
    },
  });

  let expectError = (promise, code) => {
    return promise.then(() => {
      assert(false, 'Expected error code: ' + code + ', but got a response');
    }, err => {
      assert(err.code === code, 'Expected error with code: ' + code);
    });
  };

  test('Simple GET', async () => {
    await client.get();
  });

  test('Simple GET (unauthorized)', async () => {
    await expectError(nobody.get(), 'InsufficientScopes');
  });

  test('Simple GET (wrong accessToken)', async () => {
    await expectError(wrongKey.get(), 'AuthorizationFailed');
  });

  test('GET with parameter', async () => {
    let result = await client.param('test');
    assert(result.params.param === 'test');

    result = await client.param('test2');
    assert(result.params.param === 'test2');
  });

  test('GET with parameter (unauthorized)', async () => {
    await expectError(nobody.param('test'), 'InsufficientScopes');
  });

  test('GET with parameter (wrong accessToken)', async () => {
    await expectError(wrongKey.param('test'), 'AuthorizationFailed');
  });

  test('GET with number as parameter', async () => {
    let result = await client.param(1337);
    assert(result.params.param === '1337');
  });

  test('GET with / in parameter', async () => {
    let result = await client.param('te/st');
    assert(result.params.param === 'te/st');
  });

  test('GET with two parameters', async () => {
    let result = await client.param2('te/st', 'tester');
    assert(result.params.param === 'te/st');
    assert(result.params.param2 === 'tester');
  });

  test('GET with query options', async () => {
    let result = await client.query({option: 42});
    assert(result.query === '42'); // Always transformed to string
  });

  test('GET with param and query options', async () => {
    let result = await client.paramQuery('test', {option: 42});
    assert(result.param === 'test');
    assert(result.query === '42'); // Always transformed to string
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
    let result = await client.query();
    assert(!result.query);
  });

  test('GET param without query options (for supported method)', async () => {
    let result = await client.paramQuery('test');
    assert(result.param === 'test');
    assert(!result.query);
  });

  test('GET with baseUrl', async () => {
    let client = new Client({baseUrl: 'http://localhost:23526/v1'});
    let result = await client.public();
    assert(result.ok);
  });

  test('GET with baseUrl (404)', async () => {
    let client = new Client({baseUrl: 'http://localhost:23243/v1'});
    await client.get().then(() => assert('false'), err => {
      assert(err.statusCode === 404);
    });
  });

  test('GET with authorizedScopes', async () => {
    let client = new Client({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret',
      },
      authorizedScopes: ['test:get'],
    });
    await client.get();
  });

  test('GET with authorizedScopes (*-scope)', async () => {
    let client = new Client({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret',
      },
      authorizedScopes: ['test:g*'],
    });
    await client.get();
  });

  test('GET with authorizedScopes (overscoped)', async () => {
    let client = new Client({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret',
      },
      authorizedScopes: ['*'],
    });
    await expectError(client.get(), 'AuthorizationFailed');
  });

  test('GET with authorizedScopes (unauthorized, wrong scope)', async () => {
    let client = new Client({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret',
      },
      authorizedScopes: ['test:post'],
    });
    await expectError(client.get(), 'InsufficientScopes');
  });

  test('GET with authorizedScopes (unauthorized, no scopes)', async () => {
    let client = new Client({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret',
      },
      authorizedScopes: [],
    });
    await expectError(client.get(), 'InsufficientScopes');
  });

  test('GET with temporary credentials', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:get'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds
    });
    await client.get();
  });

  test('GET with temporary credentials (unauthorized)', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:post'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds
    });
    await expectError(client.get(), 'InsufficientScopes');
  });

  test('GET with temporary credentials, authorizedScopes', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:g*'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds,
      authorizedScopes: ['test:get'],
    });
    await client.get();
  });

  test('GET with temporary credentials, authorizedScopes (fail)', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:*'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds,
      authorizedScopes: ['test:post'],
    });
    await expectError(client.get(), 'InsufficientScopes');
  });

  test('GET public resource', async () => {
    await client.public();
    let c = new Client();
    let result = await c.public();
    assert(result.ok);
  });

  test('GET public resource with query-string', async () => {
    await client.publicQuery({option: 32});
    let c = new Client();
    let result = await c.publicQuery({option: 31});
    assert(result.query === '31');
  });

  test('GET public resource no query-string (supported method)', async () => {
    await client.publicQuery();
    let c = new Client();
    await c.publicQuery();
  });

  test('POST with payload', async () => {
    let result = await client.post({hello: 'world'});
    assert(result.body.hello === 'world');
  });

  test('POST with payload and param', async () => {
    let result = await client.postParam('test', {hello: 'world'});
    assert(result.body.hello === 'world');
    assert(result.param === 'test');
  });

  test('POST with payload, param and query', async () => {
    let result = await client.postParamQuery('test', {hello: 'world'}, {
      option: 32
    });
    assert(result.body.hello === 'world');
    assert(result.param === 'test');
    assert(result.query === '32');
  });

  test('POST with payload, param and no query (when supported)', async () => {
    let result = await client.postParamQuery('test', {hello: 'world'});
    assert(result.body.hello === 'world');
    assert(result.param === 'test');
    assert(!result.query);
  });

  test('POST with payload, param and empty query', async () => {
    let result = await client.postParamQuery('test', {hello: 'world'}, {});
    assert(result.body.hello === 'world');
    assert(result.param === 'test');
    assert(!result.query);
  });

  test('Report stats', async () => {
    let record = null;
    let client = new Client({
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
    let client = new Client({
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
    assert(url === 'http://localhost:23526/v1/get-test');
  });

  test('BuildUrl with parameter', async () => {
    let url = client.buildUrl(client.param, 'test');
    assert(url === 'http://localhost:23526/v1/url-param/test/list');
  });

  test('BuildUrl with two parameters', async () => {
    let url = client.buildUrl(client.param2, 'test', 'te/st');
    assert(url === 'http://localhost:23526/v1/url-param2/test/te%2Fst/list');
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
    assert(url === 'http://localhost:23526/v1/query/test?option=2');
  });

  test('BuildUrl with empty query-string', async () => {
    let url = client.buildUrl(client.query, {});
    assert(url === 'http://localhost:23526/v1/query/test');
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
    assert(url === 'http://localhost:23526/v1/param-query/test?option=2');
  });

  test('BuildUrl with param and no query (when supported)', async () => {
    let url = client.buildUrl(client.paramQuery, 'test', {option: 34});
    assert(url === 'http://localhost:23526/v1/param-query/test?option=34');
  });

  test('BuildUrl with param and empty query', async () => {
    let url = client.buildUrl(client.paramQuery, 'test', {});
    assert(url === 'http://localhost:23526/v1/param-query/test');
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

  test('buildSignedUrl', async () => {
    let url = client.buildSignedUrl(client.get);
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with parameter', async () => {
    let url = client.buildSignedUrl(client.param, 'test');
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with two parameters', async () => {
    let url = client.buildSignedUrl(client.param2, 'test', 'te/st');
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with missing parameter', async () => {
    try {
      client.buildSignedUrl(client.param2, 'te/st');
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('buildSignedUrl with query-string', async () => {
    let url = client.buildSignedUrl(client.query, {option: 2});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with empty query-string', async () => {
    let url = client.buildSignedUrl(client.query, {});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with query-string (wrong key)', async () => {
    try {
      client.buildSignedUrl(client.query, {wrongKey: 2});
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('buildSignedUrl with param and query-string', async () => {
    let url = client.buildSignedUrl(client.paramQuery, 'test', {option: 2});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with param and no query (when supported)', async () => {
    let url = client.buildSignedUrl(client.paramQuery, 'test', {option: 34});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with param and empty query', async () => {
    let url = client.buildSignedUrl(client.paramQuery, 'test', {});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with missing parameter, but query options', async () => {
    try {
      client.buildSignedUrl(client.paramQuery, {option: 2});
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('buildSignedUrl for missing method', async () => {
    try {
      client.buildSignedUrl('test');
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('buildSignedUrl authorizedScopes', async () => {
    let client = new Client({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret',
      },
      authorizedScopes: ['test:query'],
    })
    let url = client.buildSignedUrl(client.query, {option: 2});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl authorizedScopes (unauthorized)', async () => {
    let client = new Client({
      credentials: {
        clientId:     'tester',
        accessToken:  'secret',
      },
      authorizedScopes: ['test:get'],
    })
    let url = client.buildSignedUrl(client.query, {option: 2});
    await request.get(url).end().then(() => assert(false), err => {
      assert(err.response.statusCode === 403);
    });
  });

  test('buildSignedUrl with temporary credentials', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:query'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds
    });
    let url = client.buildSignedUrl(client.query, {option: 2});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with temporary credentials (unauthorized)', async () => {
        var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:get'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds
    });
    let url = client.buildSignedUrl(client.query, {option: 2});
    await request.get(url).end().then(() => assert(false), err => {
      assert(err.response.statusCode === 403);
    });
  });

  test('buildSignedUrl with temporary credentials and expiration', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:query'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds
    });
    let url = client.buildSignedUrl(client.query, {option: 2}, {
      expiration: 600,
    });
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl with temporary credentials (expired)', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:query'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds
    });
    let url = client.buildSignedUrl(client.query, {option: 2}, {
      expiration: -600, // This seems to work, not sure how long it will work...
    });
    await request.get(url).end().then(() => assert(false), err => {
      assert(err.response.statusCode === 401);
    });
  });

  test('buildSignedUrl, temp creds + authedScopes ', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:que*'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds,
      authorizedScopes: ['test:query'],
    });
    let url = client.buildSignedUrl(client.query, {option: 2});
    assert((await request.get(url).end()).ok);
  });

  test('buildSignedUrl, temp creds + authedScopes (unauthorized)', async () => {
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:quer*'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId:       'tester',
        accessToken:    'secret',
      },
    });
    let client = new Client({
      credentials: tempCreds,
      authorizedScopes: ['test:querying'],
    });
    let url = client.buildSignedUrl(client.query, {option: 2});
    await request.get(url).end().then(() => assert(false), err => {
      assert(err.response.statusCode === 403);
    });
  });

  suite('Get with credentials from environment variables', async () => {
    let ACCESS_TOKEN  = process.env.TASKCLUSTER_ACCESS_TOKEN;
    let CLIENT_ID     = process.env.TASKCLUSTER_CLIENT_ID;

    // Ensure the client is removed from the require cache so it can be
    // reloaded from scratch.
    let cleanClient = null;
    setup(() => {
      process.env.TASKCLUSTER_CLIENT_ID    = 'tester';
      process.env.TASKCLUSTER_ACCESS_TOKEN = 'secret';

      // This is an absolute path to the client.js file. If this file is moved
      // then this obviously will break.
      let clientPath = path.resolve(__dirname, '..', 'lib', 'client.js');
      delete require.cache[clientPath];
      cleanClient = require(clientPath);
    });

    // Be a good citizen and cleanup after this test so we don't leak state.
    teardown(() => {
      if (cleanClient.agents.http.destroy) {
        cleanClient.agents.http.destroy();
        cleanClient.agents.https.destroy();
      }
      process.env.TASKCLUSTER_CLIENT_ID    = CLIENT_ID;
      process.env.TASKCLUSTER_ACCESS_TOKEN = ACCESS_TOKEN;
    });

    test('implicit credentials', async () => {
      let Client = new cleanClient.createClient(reference);
      let client = new Client();

      await client.get();
    });
  });
});
