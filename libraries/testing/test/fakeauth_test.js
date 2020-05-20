const debug = require('debug')('test');
const hawk = require('@hapi/hawk');
const request = require('superagent');
const SchemaSet = require('taskcluster-lib-validate');
const {APIBuilder} = require('taskcluster-lib-api');
const {MonitorManager} = require('taskcluster-lib-monitor');
const {App} = require('taskcluster-lib-app');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const path = require('path');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');

let monitor;
suiteSetup(function() {
  monitor = MonitorManager.setup({
    serviceName: 'whatever',
    fake: true,
    verify: true,
    debug: true,
  });
});

const builder = new APIBuilder({
  title: 'Test Server',
  description: 'for testing',
  serviceName: 'test',
  apiVersion: 'v1',
});

builder.declare({
  method: 'get',
  route: '/test',
  name: 'test',
  scopes: 'test.scope',
  title: 'Test function',
  description: 'for testing',
  category: 'Testing library',
}, async function(req, res) {
  try {
    await req.authorize();
    return res.reply({hasTestScope: true});
  } catch (err) {
    if (err.code !== 'InsufficientScopes') {
      throw err;
    }
    return res.reply({hasTestScope: false});
  }
});

suite(testing.suiteName(), function() {
  const rootUrl = 'http://localhost:1208';
  let fakeauth = testing.fakeauth;
  let server;

  suiteSetup(async function() {
    const schemaset = new SchemaSet({
      rootUrl,
      serviceName: 'lib-testing',
      folder: path.join(__dirname, 'schemas'),
    });

    // Create router for the API
    const api = await builder.build({
      schemaset,
      rootUrl,
      monitor,
    });

    // Create application
    server = await App({
      port: 1208,
      env: 'development',
      forceSSL: false,
      trustProxy: false,
      rootDocsLink: false,
      serviceName: 'test',
      apis: [api],
    });

    // Time out connections after 500 ms, prevents tests from hanging
    server.setTimeout(500);
  });

  suiteTeardown(function() {
    return server.terminate();
  });

  teardown(function() {
    fakeauth.stop();
  });

  let callApi = (clientId, extContent) => {
    // We'll call both with auth headers and bewit
    let reqUrl = libUrls.api(rootUrl, 'test', 'v1', 'test');
    let content = {
      ttlSec: 60 * 5,
      credentials: {
        id: clientId,
        key: 'unused',
        algorithm: 'sha256',
      },
    };
    if (extContent) {
      content['ext'] = Buffer.from(JSON.stringify(extContent)).toString('base64');
    }

    let {header} = hawk.client.header(reqUrl, 'GET', content);

    let bewit = hawk.uri.getBewit(reqUrl, content);
    let bewitUrl = reqUrl + '?bewit=' + bewit;
    return Promise.all([
      request
        .get(reqUrl)
        .set('Authorization', header)
        .then(function(res) {
          debug(res.body);
          return res;
        }),
      request
        .get(bewitUrl)
        .then(function(res) {
          debug(res.body);
          return res;
        }),
    ]);
  };

  test('using a rawClientId', function() {
    fakeauth.start({client1: ['test.scope']}, {rootUrl});
    return callApi('client1').then(function(responses) {
      for (let res of responses) {
        assert(res.ok && res.body.hasTestScope, 'Request failed');
      }
    });
  });

  test('using an unconfigured rawClientId', function() {
    fakeauth.start({client1: ['test.scope']}, {rootUrl});
    return callApi('unconfiguredClient')
      .then(() => {assert(false, 'should have failed');})
      .catch(function(err) {
        assert.equal(err.status, 401, 'wrong error code returned');
      });
  });

  test('using authorizedScopes', function() {
    fakeauth.start({client1: ['some.other.scope']}, {rootUrl});
    return callApi('client1', {
      authorizedScopes: ['test.scope'],
    }).then(function(responses) {
      for (let res of responses) {
        assert(res.ok && res.body.hasTestScope, 'Request failed');
      }
    });
  });

  test('using temp creds', function() {
    fakeauth.start({client1: ['some.other.scope']}, {rootUrl});
    let tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test.scope'],
      expiry: taskcluster.fromNow('1d'),
      credentials: {
        clientId: 'client1',
        accessToken: 'unused',
      },
    });
    return callApi('client1', {
      certificate: JSON.parse(tempCreds.certificate),
    }).then(function(responses) {
      for (let res of responses) {
        assert(res.ok && res.body.hasTestScope, 'Request failed');
      }
    });
  });
});
