suite("Remote Signature Validation", () => {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('auth:test:api');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
  var request     = require('superagent-promise');

  const PORT = 60321;

  var myapi = new base.API({
    title:        "Test API Server",
    description:  "API server for testing"
  });

  myapi.declare({
    method:       'get',
    route:        '/resource',
    name:         'resource',
    scopes:       [['myapi:resource']],
    title:        "Get Resource",
    description:  "..."
  }, function(req, res) {
    res.status(200).json({
      message: "Hello World"
    });
  });

  var rootCredentials = {
    clientId: 'root',
    accessToken: helper.rootAccessToken
  };

  var server, baseUrl, MyClient, myClient;
  before(async () => {
    // Create application
    var app = base.app({
      port:           PORT,
      env:            'development',
      forceSSL:       false,
      trustProxy:     false,
    });

    // Create router for the API
    var router = myapi.router({
      validator:    await base.validator(),
      authBaseUrl:  helper.baseUrl
    });

    // Mount router
    app.use('/v1', router);

    // Create server
    server = await app.createServer();
    var baseUrl = 'http://localhost:' + server.address().port + '/v1';

    var reference = myapi.reference({baseUrl});
    MyClient = taskcluster.createClient(reference);
    myClient = new MyClient({
      baseUrl,
      credentials: rootCredentials
    });
  });

  after(() => {
    return server.terminate();
  });

  test("header auth (root creds)", async () => {
    var result = await myClient.resource();
    assert(result.message === "Hello World");
  });

  test("bewit auth (root creds)", async () => {
    var signedUrl = myClient.buildSignedUrl(myClient.resource);
    var res = await request.get(signedUrl).end();
    assert(res.body.message === "Hello World");
  });

  test("header auth (no creds)", async () => {
    var myClient2 = new MyClient({baseUrl});
    await myClient2.resource().then(() => {
      assert(false, "expected an error!");
    }, err => {
      assert(err.statusCode === 401, "expected 401");
    });
  });

  test("header auth (ẃrong creds)", async () => {
    var myClient2 = new MyClient({
      baseUrl,
      credentials: {
        clientId: 'wrong',
        accessToken: 'nicetry'
      }
    });
    await myClient2.resource().then(() => {
      assert(false, "expected an error!");
    }, err => {
      assert(err.statusCode === 401, "expected 401");
    });
  });

  test("header auth (ẃrong accessToken)", async () => {
    var myClient2 = new MyClient({
      baseUrl,
      credentials: {
        clientId: 'root',
        accessToken: 'nicetry'
      }
    });
    await myClient2.resource().then(() => {
      assert(false, "expected an error!");
    }, err => {
      assert(err.statusCode === 401, "expected 401");
    });
  });

  test("header auth (temp creds)", async () => {
    var myClient2 = new MyClient({
      baseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials
      })
    });
    var result = await myClient2.resource();
    assert(result.message === "Hello World");
  });

  test("header auth (temp creds - wrong scope)", async () => {
    var myClient2 = new MyClient({
      baseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi--'],
        credentials:  rootCredentials
      })
    });
    await myClient2.resource().then(() => {
      assert(false, "expected an error!");
    }, err => {
      assert(err.statusCode === 401, "expected 401");
    });
  });

  test("header auth (temp creds + authorizedScopes)", async () => {
    var myClient2 = new MyClient({
      baseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials
      }),
      authorizedScopes: ['myapi:resource']
    });
    var result = await myClient2.resource();
    assert(result.message === "Hello World");
  });

  test("header auth (temp creds + invalid authorizedScopes)", async () => {
    var myClient2 = new MyClient({
      baseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials
      }),
      authorizedScopes: ['myapi:-']
    });
    await myClient2.resource().then(() => {
      assert(false, "expected an error!");
    }, err => {
      assert(err.statusCode === 401, "expected 401");
    });
  });

  test("header auth (temp creds + overstep authorizedScopes)", async () => {
    var myClient2 = new MyClient({
      baseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:'],
        credentials:  rootCredentials
      }),
      authorizedScopes: ['myapi:*']
    });
    await myClient2.resource().then(() => {
      assert(false, "expected an error!");
    }, err => {
      assert(err.statusCode === 401, "expected 401");
    });
  });
});