const assert = require('assert');
const debug = require('debug')('auth:test:api');
const helper = require('./helper');
const slugid = require('slugid');
const _ = require('lodash');
const assume = require('assume');
const taskcluster = require('taskcluster-client');
const request = require('superagent');

helper.secrets.mockSuite(helper.suiteName(__filename), ['app', 'azure'], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withRoles(mock, skipping);
  helper.withServers(mock, skipping);

  let rootCredentials;

  suiteSetup(function() {
    helper.setupScopes(['*']);
    rootCredentials = {
      clientId: 'static/taskcluster/root',
      accessToken: helper.rootAccessToken,
    };
  });

  test('header auth (root creds)', async () => {
    let result = await helper.testClient.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (new client)', async () => {
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: rootCredentials,
    });
    await myClient2.resource();
  });

  test('bewit auth (root creds)', async () => {
    let signedUrl = helper.testClient.buildSignedUrl(
      helper.testClient.resource
    );
    let res = await request.get(signedUrl);
    assert(res.body.message === 'Hello World');
  });

  test('header auth (no creds)', async () => {
    let myClient2 = new helper.TestClient({rootUrl: helper.rootUrl});
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 403, 'expected 403');
    });
  });

  test('header auth (wrong creds)', async () => {
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
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
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
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
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials,
      }),
    });
    let result = await myClient2.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (temp creds - wrong scope)', async () => {
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
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
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials:  taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:*'],
        credentials:  rootCredentials,
      }),
      authorizedScopes: ['myapi:resource'],
    });
    let result = await myClient2.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (temp creds + invalid authorizedScopes)', async () => {
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
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
    let myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
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
    let clientId = slugid.v4();
    let result = await helper.apiClient.createClient(clientId, {
      expires:      new Date(3000, 1, 1), // far out in the future
      description:  'Client used by automatic tests, file a bug and delete if' +
                    ' you ever see this client!',
      scopes:       ['myapi:*'],
    });

    let myClient = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: {
        clientId:     result.clientId,
        accessToken:  result.accessToken,
      },
    });
    await myClient.resource();
  });

  test('auth with non-root user (expired)', async () => {
    let clientId = slugid.v4();
    let result = await helper.apiClient.createClient(clientId, {
      expires:      new Date(1998, 1, 1), // far back in the past
      description:  'Client used by automatic tests, file a bug and delete if' +
                    ' you ever see this client!',
      scopes:       ['myapi:*'],
    });

    let myClient = new helper.TestClient({
      rootUrl: helper.rootUrl,
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
