suite('Remote Signature Validation', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('auth:test:api');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var taskcluster = require('taskcluster-client');
  var request     = require('superagent');

  setup(function() {
    if (!helper.hasPulseCredentials()) {
      this.skip();
    }
  });

  var rootCredentials = {
    clientId: 'static/taskcluster/root',
    accessToken: helper.rootAccessToken,
  };

  test('header auth (root creds)', async () => {
    var result = await helper.testClient.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (new client)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials: rootCredentials,
    });
    await myClient2.resource();
  });

  test('bewit auth (root creds)', async () => {
    var signedUrl = helper.testClient.buildSignedUrl(
      helper.testClient.resource
    );
    var res = await request.get(signedUrl);
    assert(res.body.message === 'Hello World');
  });

  test('header auth (no creds)', async () => {
    var myClient2 = new helper.TestClient({baseUrl: helper.testBaseUrl});
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 403, 'expected 403');
    });
  });

  test('header auth (wrong creds)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials: {
        clientId: 'wrong',
        accessToken: 'nicetry',
      },
    });
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 401, 'expected 401');
    });
  });

  test('header auth (wrong accessToken)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials: {
        clientId: 'static/taskcluster/root',
        accessToken: 'nicetry',
      },
    });
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 401, 'expected 401');
    });
  });

  test('header auth (temp creds)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials,
      }),
    });
    var result = await myClient2.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (temp creds - wrong scope)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi--'],
        credentials:  rootCredentials,
      }),
    });
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 403, 'expected 403');
    });
  });

  test('header auth (temp creds + authorizedScopes)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials,
      }),
      authorizedScopes: ['myapi:resource'],
    });
    var result = await myClient2.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (temp creds + invalid authorizedScopes)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials,
      }),
      authorizedScopes: ['myapi:-'],
    });
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 403, 'expected 403');
    });
  });

  test('header auth (temp creds + overstep authorizedScopes)', async () => {
    var myClient2 = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:'],
        credentials:  rootCredentials,
      }),
      authorizedScopes: ['myapi:*'],
    });
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 401, 'expected 401');
    });
  });

  test('auth with non-root user', async () => {
    var clientId = slugid.v4();
    var result = await helper.auth.createClient(clientId, {
      expires:      new Date(3000, 1, 1), // far out in the future
      description:  'Client used by automatic tests, file a bug and delete if' +
                    ' you ever see this client!',
      scopes:       ['myapi:*'],
    });

    var myClient = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials: {
        clientId:     result.clientId,
        accessToken:  result.accessToken,
      },
    });
    await myClient.resource();
  });

  test('auth with non-root user (expired)', async () => {
    var clientId = slugid.v4();
    var result = await helper.auth.createClient(clientId, {
      expires:      new Date(1998, 1, 1), // far back in the past
      description:  'Client used by automatic tests, file a bug and delete if' +
                    ' you ever see this client!',
      scopes:       ['myapi:*'],
    });

    var myClient = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials: {
        clientId:     result.clientId,
        accessToken:  result.accessToken,
      },
    });
    await myClient.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 401, 'expected 401');
    });
  });
});
