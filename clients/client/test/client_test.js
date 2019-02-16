suite('client requests/responses', function() {
  var taskcluster = require('../');
  var assert = require('assert');
  var path = require('path');
  var debug = require('debug')('test:client');
  var _ = require('lodash');
  var nock = require('nock');
  var MonitorBuilder = require('taskcluster-lib-monitor');

  // This suite exercises the request and response functionality of
  // the client against a totally fake service defined by this reference
  // and implemented via Nock.
  let entries = [
    {
      type: 'function',
      method: 'get',
      route: '/get-test',
      query: [],
      args: [],
      name: 'get',
      stability: 'experimental',
      title: 'Test Get',
      description: 'Place we can call to test GET',
      scopes: [],
    },
    {
      type: 'function',
      method: 'post',
      route: '/post-test',
      query: [],
      args: [],
      name: 'post',
      stability: 'experimental',
      title: 'Test Post',
      description: 'Place we can call to test POST',
      scopes: [],
      input: 'http://schemas.taskcluster.net/nothing.json',
    },
    {
      type: 'function',
      method: 'post',
      route: '/post-param/<param>',
      query: [],
      args: ['param'],
      name: 'postParam',
      stability: 'experimental',
      title: 'Test Post Param',
      description: 'Place we can call to test POST with params',
      scopes: [],
      input: 'http://schemas.taskcluster.net/nothing.json',
    },
    {
      type: 'function',
      method: 'post',
      route: '/post-param-query/<param>',
      query: ['option'],
      args: ['param'],
      name: 'postParamQuery',
      stability: 'experimental',
      title: 'Test Post Param Query',
      description: 'Place we can call to test POST with params and a query',
      scopes: [],
      input: 'http://schemas.taskcluster.net/nothing.json',
    },
    {
      type: 'function',
      method: 'get',
      route: '/url-param/<param>/list',
      query: [],
      args: ['param'],
      name: 'param',
      stability: 'experimental',
      title: 'Test Params',
      description: 'Place we can call to test url parameters',
      scopes: [],
    },
    {
      type: 'function',
      method: 'get',
      route: '/url-param2/<param1>/<param2>/list',
      query: [],
      args: ['param1', 'param2'],
      name: 'param2',
      stability: 'experimental',
      title: 'Test Params',
      description: 'Place we can call to test url parameters',
      scopes: [],
    },
    {
      type: 'function',
      method: 'get',
      route: '/query/test',
      query: ['option'],
      args: [],
      name: 'query',
      stability: 'experimental',
      title: 'Test Query string options',
      description: 'Place we can call to test query string',
      scopes: [],
    },
    {
      type: 'function',
      method: 'get',
      route: '/param-query/<param>',
      query: ['option'],
      args: ['param'],
      name: 'paramQuery',
      stability: 'experimental',
      title: 'Test Query string options with params',
      description: 'Place we can call to test query string with params',
      scopes: [],
    },
  ];

  var referenceBaseUrlStyle = {
    version: 0,
    $schema: 'http://schemas.taskcluster.net/base/v1/api-reference.json#',
    title: 'Fake API (with just baseUrl)',
    description: 'Fake API',
    baseUrl: 'https://fake.taskcluster.net/v1',
    entries,
  };
  var referenceBothStyle = {
    version: 0,
    $schema: 'http://schemas.taskcluster.net/base/v1/api-reference.json#',
    title: 'Fake API (with baseUrl and name)',
    description: 'Fake API',
    baseUrl: 'https://fake0.taskcluster.net/v1',
    name: 'fake1',
    entries,
  };
  var referenceNameStyle = {
    version: 0,
    $schema: 'http://schemas.taskcluster.net/base/v1/api-reference.json#',
    title: 'Fake API (with just name)',
    description: 'Fake API',
    name: 'fake2',
    entries,
  };

  teardown(function() {
    assert(nock.isDone());
    nock.cleanAll();
  });

  const subjects = {
    old: {
      name: 'just https://taskcluster.net',
      urlPrefix: 'https://fake.taskcluster.net',
      Fake: taskcluster.createClient(referenceBaseUrlStyle),
      rootUrl: 'https://taskcluster.net',
      client: (() => {
        const Fake = taskcluster.createClient(referenceBaseUrlStyle);
        return new Fake({
          rootUrl: 'https://taskcluster.net',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      })(),
    },
    bothWays: {
      name: 'baseurl and rootUrl with rootUrl set',
      urlPrefix: 'https://whatever.net/api/fake1',
      Fake: taskcluster.createClient(referenceBothStyle),
      rootUrl: 'https://whatever.net',
      client: (() => {
        const Fake = taskcluster.createClient(referenceBothStyle);
        return new Fake({
          rootUrl: 'https://whatever.net',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      })(),
    },
    justRootUrl: {
      name: 'rootUrl set via constructor',
      urlPrefix: 'https://whatever.net/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net',
      client: (() => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        return new Fake({
          rootUrl: 'https://whatever.net',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      })(),
    },
    rootUrlWithPath: {
      name: 'rootUrl set via constructor with path',
      urlPrefix: 'https://whatever.net/taskcluster/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net/taskcluster',
      client: (() => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        return new Fake({
          rootUrl: 'https://whatever.net/taskcluster',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      })(),
    },
    rootUrlWithPathAndSubdomain: {
      name: 'rootUrl set via constructor with path and subdomain',
      urlPrefix: 'https://foo.whatever.net/taskcluster/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://foo.whatever.net/taskcluster',
      client: (() => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        return new Fake({
          rootUrl: 'https://foo.whatever.net/taskcluster',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      })(),
    },
    usingEnvVar: {
      name: 'rootUrl set via env var',
      urlPrefix: 'https://whatever.net/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net',
      client: (() => {
        process.env.TASKCLUSTER_ROOT_URL = 'https://whatever.net';
        const clientPath = path.resolve(__dirname, '..', 'src', 'client.js');
        delete require.cache[clientPath];
        const cleanClient = require(clientPath);
        const Fake = cleanClient.createClient(referenceNameStyle);
        const fake = new Fake(Object.assign({},
          taskcluster.fromEnvVars(), {
            credentials: {
              clientId: 'nobody',
              accessToken: 'nothing',
            },
          },
        ));
        delete process.env.TASKCLUSTER_ROOT_URL;
        return fake;
      })(),
    },
  };

  let insufficientScopesError = {
    code: 'InsufficientScopes',
    message: 'You do not have sufficient scopes.',
    requestInfo: {},
    details: {},
  };

  let authFailedError = {
    code: 'AuthorizationFailed',
    message: 'Authorization Failed',
    error: {
      info: 'None of the scope-sets was satisfied',
      scopesets: [['gotta-get:foo']],
      scopes: [],
    },
  };

  let expectError = (promise, code) => {
    return promise.then(() => {
      assert(false, 'Expected error code: ' + code + ', but got a response');
    }, err => {
      assert(err.code === code, 'Expected error with code: ' + code + ' but got ' + err.code);
    });
  };

  Object.keys(subjects).forEach(subject => {
    const {name, urlPrefix, client, Fake, rootUrl} = subjects[subject];
    suite(name, () => {
      test('Simple GET', async () => {
        nock(urlPrefix).get('/v1/get-test')
          .reply(200, {});
        await client.get();
      });

      test('Simple GET (unauthorized)', async () => {
        nock(urlPrefix).get('/v1/get-test')
          .reply(403, insufficientScopesError);
        await expectError(client.get(), 'InsufficientScopes');
      });

      test('Simple GET (wrong accessToken)', async () => {
        nock(urlPrefix).get('/v1/get-test')
          .reply(403, authFailedError);
        await expectError(client.get(), 'AuthorizationFailed');
      });

      test('GET with parameter', async () => {
        nock(urlPrefix).get('/v1/url-param/test/list')
          .reply(200, {params: {param: 'test'}});
        let result = await client.param('test');
        assert(result.params.param === 'test');
      });

      test('GET with number as parameter', async () => {
        nock(urlPrefix).get('/v1/url-param/1337/list')
          .reply(200, {params: {param: '1337'}});
        await client.param(1337);
      });

      test('GET with / in parameter', async () => {
        nock(urlPrefix).get('/v1/url-param/te%2Fst/list')
          .reply(200, {params: {param: 'te/st'}});
        await client.param('te/st');
      });

      test('GET with two parameters', async () => {
        nock(urlPrefix).get('/v1/url-param2/te%2Fst/tester/list')
          .reply(200, {params: {param: 'te/st'}});
        await client.param2('te/st', 'tester');
      });

      test('GET with query options', async () => {
        nock(urlPrefix).get('/v1/query/test?option=42')
          .reply(200, {});
        await client.query({option: 42});
      });

      test('GET with param and query options', async () => {
        nock(urlPrefix).get('/v1/param-query/test?option=42')
          .reply(200, {});
        await client.paramQuery('test', {option: 42});
      });

      test('GET with missing parameter, but query options', async () => {
        try {
          await client.paramQuery({option: 42});
        } catch (err) {
          return;
        }
        assert(false, 'Expected an error');
      });

      test('GET without query options (for supported method)', async () => {
        nock(urlPrefix).get('/v1/query/test')
          .reply(200, {});
        await client.query();
      });

      test('GET param without query options (for supported method)', async () => {
        nock(urlPrefix).get('/v1/param-query/test')
          .reply(200, {});
        await client.paramQuery('test');
      });

      test('GET public resource', async () => {
        nock(urlPrefix).get('/v1/get-test')
          .reply(200, {});
        let c = new Fake({rootUrl});
        await c.get();
      });

      test('GET public resource with query-string', async () => {
        nock(urlPrefix).get('/v1/query/test?option=31')
          .reply(200, {});
        let c = new Fake({rootUrl});
        await c.query({option: 31});
      });

      test('GET public resource no query-string (supported method)', async () => {
        nock(urlPrefix).get('/v1/query/test')
          .reply(200, {});
        let c = new Fake({rootUrl});
        await c.query();
      });

      test('POST with payload', async () => {
        nock(urlPrefix)
          .post('/v1/post-test', {hello: 'world'})
          .reply(200, {reply: 'hi'});
        let result = await client.post({hello: 'world'});
        assert.deepEqual(result, {reply: 'hi'});
      });

      test('POST with payload and param', async () => {
        nock(urlPrefix)
          .post('/v1/post-param/test', {hello: 'world'})
          .reply(200, {});
        await client.postParam('test', {hello: 'world'});
      });

      test('POST with payload, param and query', async () => {
        nock(urlPrefix)
          .post('/v1/post-param-query/test?option=32', {hello: 'world'})
          .reply(200, {});
        await client.postParamQuery('test', {hello: 'world'}, {
          option: 32,
        });
      });

      test('POST with payload, param and no query (when supported)', async () => {
        nock(urlPrefix)
          .post('/v1/post-param-query/test', {hello: 'world'})
          .reply(200, {});
        await client.postParamQuery('test', {hello: 'world'});
      });

      test('POST with payload, param and empty query', async () => {
        nock(urlPrefix)
          .post('/v1/post-param-query/test', {hello: 'world'})
          .reply(200, {});
        await client.postParamQuery('test', {hello: 'world'}, {});
      });

      test('Report stats', async () => {
        let monitorBuilder = new MonitorBuilder({
          projectName: 'tc-client',
        });
        monitorBuilder.setup({
          mock: true,
        });
        let client = new Fake({
          credentials: {
            clientId: 'tester',
            accessToken: 'secret',
          },
          monitor: monitorBuilder.monitor(),
          rootUrl,
        });
        // Inspect the credentials
        nock(urlPrefix).get('/v1/get-test')
          .reply(200, {});
        await client.get();
        assert(monitorBuilder.messages.length > 0);
      });

      test('Report stats (unauthorized)', async () => {
        let monitorBuilder = new MonitorBuilder({
          projectName: 'tc-client',
        });
        monitorBuilder.setup({
          mock: true,
        });
        let client = new Fake({
          credentials: {
            clientId: 'tester',
            accessToken: 'wrong',
          },
          monitor: monitorBuilder.monitor(),
          rootUrl,
        });
        // Inspect the credentials
        nock(urlPrefix).get('/v1/get-test')
          .reply(401, authFailedError);
        await expectError(client.get(), 'AuthorizationFailed');
        assert(monitorBuilder.messages.length > 0);
      });

      let assertBewitUrl = function(url, expected) {
        url = url.replace(/bewit=[^&]*/, 'bewit=XXX');
        assert.equal(url, expected);
      };

      // note that the signatures for buildSignedUrl are checked in creds_test.js

      test('BuildUrl', async () => {
        let url = client.buildUrl(client.get);
        assert.equal(url, `${urlPrefix}/v1/get-test`);
      });

      test('BuildSignedUrl', async () => {
        let url = client.buildSignedUrl(client.get);
        assertBewitUrl(url, `${urlPrefix}/v1/get-test?bewit=XXX`);
      });

      test('BuildUrl with parameter', async () => {
        let url = client.buildUrl(client.param, 'test');
        assert.equal(url, `${urlPrefix}/v1/url-param/test/list`);
      });

      test('BuildSignedUrl with parameter', async () => {
        let url = client.buildSignedUrl(client.param, 'test');
        assertBewitUrl(url, `${urlPrefix}/v1/url-param/test/list?bewit=XXX`);
      });

      test('BuildUrl with two parameters', async () => {
        let url = client.buildUrl(client.param2, 'test', 'te/st');
        assert.equal(url, `${urlPrefix}/v1/url-param2/test/te%2Fst/list`);
      });

      test('BuildSignedUrl with two parameters', async () => {
        let url = client.buildSignedUrl(client.param2, 'test', 'te/st');
        assertBewitUrl(url,
          `${urlPrefix}/v1/url-param2/test/te%2Fst/list?bewit=XXX`);
      });

      test('BuildUrl with missing parameter', async () => {
        try {
          client.buildUrl(client.param2, 'te/st');
        } catch (err) {
          return;
        }
        assert(false);
      });

      test('BuildSignedUrl with missing parameter', async () => {
        try {
          client.buildSignedUrl(client.param2, 'te/st');
        } catch (err) {
          return;
        }
        assert(false);
      });

      test('BuildUrl with query-string', async () => {
        let url = client.buildUrl(client.query, {option: 2});
        assert.equal(url, `${urlPrefix}/v1/query/test?option=2`);
      });

      test('BuildSignedUrl with query-string', async () => {
        let url = client.buildSignedUrl(client.query, {option: 2});
        assertBewitUrl(url, `${urlPrefix}/v1/query/test?option=2&bewit=XXX`);
      });

      test('BuildUrl with empty query-string', async () => {
        let url = client.buildUrl(client.query, {});
        assert.equal(url, `${urlPrefix}/v1/query/test`);
      });

      test('BuildSignedUrl with query-string', async () => {
        let url = client.buildSignedUrl(client.query, {});
        assertBewitUrl(url, `${urlPrefix}/v1/query/test?bewit=XXX`);
      });

      test('BuildUrl with query-string (wrong key)', async () => {
        try {
          client.buildUrl(client.query, {wrongKey: 2});
        } catch (err) {
          return;
        }
        assert(false);
      });

      test('BuildSignedUrl with query-string (wrong key)', async () => {
        try {
          client.buildSignedUrl(client.query, {wrongKey: 2});
        } catch (err) {
          return;
        }
        assert(false);
      });

      test('BuildUrl with param and query-string', async () => {
        let url = client.buildUrl(client.paramQuery, 'test', {option: 2});
        assert.equal(url, `${urlPrefix}/v1/param-query/test?option=2`);
      });

      test('BuildSignedUrl with param and query-string', async () => {
        let url = client.buildSignedUrl(client.paramQuery, 'test', {option: 2});
        assertBewitUrl(url,
          `${urlPrefix}/v1/param-query/test?option=2&bewit=XXX`);
      });

      test('BuildUrl with param and no query (when supported)', async () => {
        let url = client.buildUrl(client.paramQuery, 'test', {option: 34});
        assert.equal(url, `${urlPrefix}/v1/param-query/test?option=34`);
      });

      test('BuildSignedUrl with param and no query (when supported)', async () => {
        let url = client.buildSignedUrl(client.paramQuery, 'test', {option: 34});
        assertBewitUrl(url,
          `${urlPrefix}/v1/param-query/test?option=34&bewit=XXX`);
      });

      test('BuildUrl with param and empty query', async () => {
        let url = client.buildUrl(client.paramQuery, 'test', {});
        assert.equal(url, `${urlPrefix}/v1/param-query/test`);
      });

      test('BuildSignedUrl with param and empty query', async () => {
        let url = client.buildSignedUrl(client.paramQuery, 'test', {});
        assertBewitUrl(url, `${urlPrefix}/v1/param-query/test?bewit=XXX`);
      });

      test('BuildUrl with missing parameter, but query options', async () => {
        try {
          client.buildUrl(client.paramQuery, {option: 2});
        } catch (err) {
          return;
        }
        assert(false);
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

      test('buildSignedUrl for missing method', async () => {
        try {
          client.buildSignedUrl('test');
        } catch (err) {
          return;
        }
        assert(false);
      });
    });
  });

  test('inject custom fake method', async function() {
    let client;
    let gotArgs;

    const Fake = taskcluster.createClient(referenceNameStyle);
    client = new Fake({
      rootUrl: 'https://whatever.net',
      credentials: {
        clientId: 'nobody',
        accessToken: 'nothing',
      },
      fake: {
        postParam: async function() {
          gotArgs = Array.prototype.slice.call(arguments);
          return {result: 42};
        },
      },
    });

    const gotResult = await client.postParam('test', {hello: 'world'});
    assert.deepEqual(gotArgs, ['test', {hello: 'world'}]);
    assert.deepEqual(gotResult, {result: 42});
    assert.deepEqual(client.fakeCalls.postParam, [{
      param: 'test',
      payload: {hello: 'world'},
    }]);
  });
});
