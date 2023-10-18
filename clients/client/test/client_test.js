const taskcluster = require('../');
const assert = require('assert');
const path = require('path');
const nock = require('nock');
const net = require('net');
const testing = require('./helper');

suite(testing.suiteName(), function() {
  testing.withRestoredEnvVars();

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
      input: 'http://tc-tests.example.com/schemas/nothing.json',
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
      input: 'http://tc-tests.example.com/schemas/nothing.json',
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
      input: 'http://tc-tests.example.com/schemas/nothing.json',
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
    {
      type: 'function',
      method: 'get',
      route: '/redirect',
      query: [],
      args: [],
      name: 'redirect',
      stability: 'experimental',
      title: 'Redirect',
      description: 'Place we can call to test redirection',
      scopes: [],
    },
  ];

  let referenceNameStyle = {
    version: 0,
    $schema: 'http://tc-tests.example.com/schemas/base/v1/api-reference.json#',
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
    serviceDiscoveryK8sDns: {
      name: 'using k8s dns service discovery',
      urlPrefix: 'http://taskcluster-fake2/api/fake2',
      trueUrlPrefix: 'https://example.not-there/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net',
      serviceDiscoveryScheme: 'k8s-dns',
      makeClient: () => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        return new Fake({
          rootUrl: 'https://example.not-there',
          serviceDiscoveryScheme: 'k8s-dns',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      },
    },
    serviceDiscoveryK8sDnsDefault: {
      name: 'using k8s dns service discovery (default)',
      urlPrefix: 'http://taskcluster-fake2/api/fake2',
      trueUrlPrefix: 'https://example.not-there/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net',
      serviceDiscoveryScheme: 'k8s-dns',
      makeClient: () => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        taskcluster.setServiceDiscoveryScheme('k8s-dns');
        const clnt = new Fake({
          rootUrl: 'https://example.not-there',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
        taskcluster.setServiceDiscoveryScheme('default');
        return clnt;
      },
    },
    justRootUrl: {
      name: 'rootUrl set via constructor',
      urlPrefix: 'https://whatever.net/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net',
      makeClient: () => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        return new Fake({
          rootUrl: 'https://whatever.net',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      },
    },
    rootUrlWithPath: {
      name: 'rootUrl set via constructor with path',
      urlPrefix: 'https://whatever.net/taskcluster/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net/taskcluster',
      makeClient: () => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        return new Fake({
          rootUrl: 'https://whatever.net/taskcluster',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      },
    },
    rootUrlWithPathAndSubdomain: {
      name: 'rootUrl set via constructor with path and subdomain',
      urlPrefix: 'https://foo.whatever.net/taskcluster/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://foo.whatever.net/taskcluster',
      makeClient: () => {
        const Fake = taskcluster.createClient(referenceNameStyle);
        return new Fake({
          rootUrl: 'https://foo.whatever.net/taskcluster',
          credentials: {
            clientId: 'nobody',
            accessToken: 'nothing',
          },
        });
      },
    },
    usingEnvVar: {
      name: 'rootUrl set via env var',
      urlPrefix: 'https://whatever.net/api/fake2',
      Fake: taskcluster.createClient(referenceNameStyle),
      rootUrl: 'https://whatever.net',
      makeClient: () => {
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
      },
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
    const { name, urlPrefix, trueUrlPrefix, makeClient, Fake, rootUrl, serviceDiscoveryScheme } = subjects[subject];
    suite(name, () => {
      let client;
      suiteSetup('create client', function() {
        client = makeClient();
      });

      test('Simple GET', async () => {
        nock(urlPrefix).get('/v1/get-test')
          .reply(200, {});
        await client.get();
      });

      test('GET public resource (sets traceId)', async () => {
        const requestId = '123';
        const traceId = '456';
        nock(urlPrefix).get('/v1/get-test')
          .reply(function() {
            return [200, { traceId: this.req.headers['x-taskcluster-trace-id'] }];
          });
        let c = new Fake({ rootUrl, serviceDiscoveryScheme });
        c = c.taskclusterPerRequestInstance({ traceId, requestId });
        assert.equal((await c.get()).traceId, '456');
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
          .reply(200, { params: { param: 'test' } });
        let result = await client.param('test');
        assert(result.params.param === 'test');
      });

      test('GET with number as parameter', async () => {
        nock(urlPrefix).get('/v1/url-param/1337/list')
          .reply(200, { params: { param: '1337' } });
        await client.param(1337);
      });

      test('GET with / in parameter', async () => {
        nock(urlPrefix).get('/v1/url-param/te%2Fst/list')
          .reply(200, { params: { param: 'te/st' } });
        await client.param('te/st');
      });

      test('GET with two parameters', async () => {
        nock(urlPrefix).get('/v1/url-param2/te%2Fst/tester/list')
          .reply(200, { params: { param: 'te/st' } });
        await client.param2('te/st', 'tester');
      });

      test('GET with query options', async () => {
        nock(urlPrefix).get('/v1/query/test?option=42')
          .reply(200, {});
        await client.query({ option: 42 });
      });

      test('GET with param and query options', async () => {
        nock(urlPrefix).get('/v1/param-query/test?option=42')
          .reply(200, {});
        await client.paramQuery('test', { option: 42 });
      });

      test('GET with missing parameter, but query options', async () => {
        try {
          await client.paramQuery({ option: 42 });
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
        let c = new Fake({ rootUrl, serviceDiscoveryScheme });
        await c.get();
      });

      test('GET public resource with query-string', async () => {
        nock(urlPrefix).get('/v1/query/test?option=31')
          .reply(200, {});
        let c = new Fake({ rootUrl, serviceDiscoveryScheme });
        await c.query({ option: 31 });
      });

      test('GET public resource no query-string (supported method)', async () => {
        nock(urlPrefix).get('/v1/query/test')
          .reply(200, {});
        let c = new Fake({ rootUrl, serviceDiscoveryScheme });
        await c.query();
      });

      test('POST with payload', async () => {
        nock(urlPrefix)
          .post('/v1/post-test', { hello: 'world' })
          .reply(200, { reply: 'hi' });
        let result = await client.post({ hello: 'world' });
        assert.deepEqual(result, { reply: 'hi' });
      });

      test('POST with payload and param', async () => {
        nock(urlPrefix)
          .post('/v1/post-param/test', { hello: 'world' })
          .reply(200, {});
        await client.postParam('test', { hello: 'world' });
      });

      test('POST with payload, param and query', async () => {
        nock(urlPrefix)
          .post('/v1/post-param-query/test?option=32', { hello: 'world' })
          .reply(200, {});
        await client.postParamQuery('test', { hello: 'world' }, {
          option: 32,
        });
      });

      test('POST with payload, param and no query (when supported)', async () => {
        nock(urlPrefix)
          .post('/v1/post-param-query/test', { hello: 'world' })
          .reply(200, {});
        await client.postParamQuery('test', { hello: 'world' });
      });

      test('POST with payload, param and empty query', async () => {
        nock(urlPrefix)
          .post('/v1/post-param-query/test', { hello: 'world' })
          .reply(200, {});
        await client.postParamQuery('test', { hello: 'world' }, {});
      });

      test('GET something that redirects', async () => {
        nock(urlPrefix).get('/v1/redirect')
          .reply(303, { url: 'http://example.com' }, { 'location': 'http://example.com' });
        let c = new Fake({ rootUrl, serviceDiscoveryScheme });
        let res = await c.redirect();
        assert.deepEqual(res, { url: 'http://example.com' });
      });

      let assertBewitUrl = function(url, expected) {
        url = url.replace(/bewit=[^&]*/, 'bewit=XXX');
        assert.equal(url, expected);
      };

      // note that the signatures for buildSignedUrl are checked in creds_test.js
      for (const cl of [
        {
          buildUrl: (...arg) => client.buildUrl(...arg),
          buildSignedUrl: (...arg) => client.buildSignedUrl(...arg),
          urlPrefix,
          type: 'internal',
        },
        {
          buildUrl: (...arg) => client.externalBuildUrl(...arg),
          buildSignedUrl: (...arg) => client.externalBuildSignedUrl(...arg),
          urlPrefix: trueUrlPrefix || urlPrefix,
          type: 'external',
        },
        {
          buildUrl: (...arg) => {
            const cc = client.taskclusterPerRequestInstance({ traceId: 'foo' });
            return cc.buildUrl(...arg);
          },
          buildSignedUrl: (...arg) => {
            const cc = client.taskclusterPerRequestInstance({ traceId: 'foo' });
            return cc.buildSignedUrl(...arg);
          },
          urlPrefix,
          type: 'internal (per request)',
        },
        {
          buildUrl: (...arg) => {
            const cc = client.taskclusterPerRequestInstance({ traceId: 'foo' });
            return cc.externalBuildUrl(...arg);
          },
          buildSignedUrl: (...arg) => {
            const cc = client.taskclusterPerRequestInstance({ traceId: 'foo' });
            return cc.externalBuildSignedUrl(...arg);
          },
          urlPrefix: trueUrlPrefix || urlPrefix,
          type: 'external (per request)',
        },
      ]) {
        suite(cl.type, function() {
          test('BuildUrl', async () => {
            let url = cl.buildUrl(client.get);
            assert.equal(url, `${cl.urlPrefix}/v1/get-test`);
          });

          test('BuildSignedUrl', async () => {
            let url = cl.buildSignedUrl(client.get);
            assertBewitUrl(url, `${cl.urlPrefix}/v1/get-test?bewit=XXX`);
          });

          test('BuildUrl with parameter', async () => {
            let url = cl.buildUrl(client.param, 'test');
            assert.equal(url, `${cl.urlPrefix}/v1/url-param/test/list`);
          });

          test('BuildSignedUrl with parameter', async () => {
            let url = cl.buildSignedUrl(client.param, 'test');
            assertBewitUrl(url, `${cl.urlPrefix}/v1/url-param/test/list?bewit=XXX`);
          });

          test('BuildUrl with two parameters', async () => {
            let url = cl.buildUrl(client.param2, 'test', 'te/st');
            assert.equal(url, `${cl.urlPrefix}/v1/url-param2/test/te%2Fst/list`);
          });

          test('BuildSignedUrl with two parameters', async () => {
            let url = cl.buildSignedUrl(client.param2, 'test', 'te/st');
            assertBewitUrl(url,
              `${cl.urlPrefix}/v1/url-param2/test/te%2Fst/list?bewit=XXX`);
          });

          test('BuildUrl with missing parameter', async () => {
            try {
              cl.buildUrl(client.param2, 'te/st');
            } catch (err) {
              return;
            }
            assert(false);
          });

          test('BuildSignedUrl with missing parameter', async () => {
            try {
              cl.buildSignedUrl(client.param2, 'te/st');
            } catch (err) {
              return;
            }
            assert(false);
          });

          test('BuildUrl with query-string', async () => {
            let url = cl.buildUrl(client.query, { option: 2 });
            assert.equal(url, `${cl.urlPrefix}/v1/query/test?option=2`);
          });

          test('BuildSignedUrl with query-string', async () => {
            let url = cl.buildSignedUrl(client.query, { option: 2 });
            assertBewitUrl(url, `${cl.urlPrefix}/v1/query/test?option=2&bewit=XXX`);
          });

          test('BuildUrl with empty query-string', async () => {
            let url = cl.buildUrl(client.query, {});
            assert.equal(url, `${cl.urlPrefix}/v1/query/test`);
          });

          test('BuildSignedUrl with query-string', async () => {
            let url = cl.buildSignedUrl(client.query, {});
            assertBewitUrl(url, `${cl.urlPrefix}/v1/query/test?bewit=XXX`);
          });

          test('BuildUrl with query-string (wrong key)', async () => {
            try {
              cl.buildUrl(client.query, { wrongKey: 2 });
            } catch (err) {
              return;
            }
            assert(false);
          });

          test('BuildSignedUrl with query-string (wrong key)', async () => {
            try {
              cl.buildSignedUrl(client.query, { wrongKey: 2 });
            } catch (err) {
              return;
            }
            assert(false);
          });

          test('BuildUrl with param and query-string', async () => {
            let url = cl.buildUrl(client.paramQuery, 'test', { option: 2 });
            assert.equal(url, `${cl.urlPrefix}/v1/param-query/test?option=2`);
          });

          test('BuildSignedUrl with param and query-string', async () => {
            let url = cl.buildSignedUrl(client.paramQuery, 'test', { option: 2 });
            assertBewitUrl(url,
              `${cl.urlPrefix}/v1/param-query/test?option=2&bewit=XXX`);
          });

          test('BuildUrl with param and no query (when supported)', async () => {
            let url = cl.buildUrl(client.paramQuery, 'test', { option: 34 });
            assert.equal(url, `${cl.urlPrefix}/v1/param-query/test?option=34`);
          });

          test('BuildSignedUrl with param and no query (when supported)', async () => {
            let url = cl.buildSignedUrl(client.paramQuery, 'test', { option: 34 });
            assertBewitUrl(url,
              `${cl.urlPrefix}/v1/param-query/test?option=34&bewit=XXX`);
          });

          test('BuildUrl with param and empty query', async () => {
            let url = cl.buildUrl(client.paramQuery, 'test', {});
            assert.equal(url, `${cl.urlPrefix}/v1/param-query/test`);
          });

          test('BuildSignedUrl with param and empty query', async () => {
            let url = cl.buildSignedUrl(client.paramQuery, 'test', {});
            assertBewitUrl(url, `${cl.urlPrefix}/v1/param-query/test?bewit=XXX`);
          });

          test('BuildUrl with missing parameter, but query options', async () => {
            try {
              cl.buildUrl(client.paramQuery, { option: 2 });
            } catch (err) {
              return;
            }
            assert(false);
          });

          test('BuildUrl with missing parameter, but query options', async () => {
            try {
              cl.buildUrl(client.paramQuery, { option: 2 });
            } catch (err) {
              return;
            }
            assert(false);
          });

          test('BuildUrl for missing method', async () => {
            try {
              cl.buildUrl('test');
            } catch (err) {
              return;
            }
            assert(false);
          });

          test('buildSignedUrl for missing method', async () => {
            try {
              cl.buildSignedUrl('test');
            } catch (err) {
              return;
            }
            assert(false);
          });
        });
      }
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
          return { result: 42 };
        },
      },
    });

    const gotResult = await client.postParam('test', { hello: 'world' });
    assert.deepEqual(gotArgs, ['test', { hello: 'world' }]);
    assert.deepEqual(gotResult, { result: 42 });
    assert.deepEqual(client.fakeCalls.postParam, [{
      param: 'test',
      payload: { hello: 'world' },
    }]);
  });

  test('timeout raises ECONNABORTED', async function() {
    let server;

    await new Promise((resolve, reject) => {
      server = net.createServer((socket) => {
        testing.sleep(300).then(() => socket.destroy());
      }).on('error', err => {
        reject(err);
      });
      server.listen(resolve);
    });

    try {
      let referenceBaseUrlStyle = {
        version: 0,
        $schema: 'http://tc-tests.example.com/schemas/base/v1/api-reference.json#',
        title: 'Fake API (with just baseUrl)',
        description: 'Fake API',
        entries: [],
      };
      const Fake = taskcluster.createClient(referenceBaseUrlStyle);
      const client = new Fake({
        timeout: 20,
        rootUrl: 'https://tc.example.com',
      });
      await assert.rejects(
        taskcluster.makeRequest(client, 'GET', 'https://127.0.0.1:' + server.address().port),
        err => err.code === 'ECONNABORTED');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
