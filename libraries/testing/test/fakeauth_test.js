const debug = require('debug')('test');
const _ = require('lodash');
const nock = require('nock');
const hawk = require('hawk');
const request = require('superagent');
const SchemaSet = require('taskcluster-lib-validate');
const APIBuilder = require('taskcluster-lib-api');
const MonitorBuilder = require('taskcluster-lib-monitor');
const App = require('taskcluster-lib-app');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const Promise = require('promise');
const path = require('path');
const libUrls = require('taskcluster-lib-urls');

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

suite('fakeauth', function() {
  const rootUrl = 'http://localhost:1208';
  var fakeauth = require('../src/fakeauth');
  var server;

  suiteSetup(async function() {
    const schemaset = new SchemaSet({
      rootUrl,
      serviceName: 'lib-testing',
      folder: path.join(__dirname, 'schemas'),
    });

    const monitorBuilder = new MonitorBuilder({
      projectName: 'whatever',
    });
    monitorBuilder.setup({enable: false});

    // Create router for the API
    const api = await builder.build({
      schemaset,
      rootUrl,
      monitor: monitorBuilder.monitor('api'),
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

  var callApi = (clientId, extContent) => {
    // We'll call both with auth headers and bewit
    var reqUrl = libUrls.api(rootUrl, 'test', 'v1', 'test');
    var content = {
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

    var {header} = hawk.client.header(reqUrl, 'GET', content);

    var bewit = hawk.uri.getBewit(reqUrl, content);
    var bewitUrl = reqUrl + '?bewit=' + bewit;
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
      for (var res of responses) {
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
      for (var res of responses) {
        assert(res.ok && res.body.hasTestScope, 'Request failed');
      }
    });
  });

  test('using temp creds', function() {
    fakeauth.start({client1: ['some.other.scope']}, {rootUrl});
    var tempCreds = taskcluster.createTemporaryCredentials({
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
      for (var res of responses) {
        assert(res.ok && res.body.hasTestScope, 'Request failed');
      }
    });
  });
});
