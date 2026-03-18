import assert from 'node:assert';
import helper from './helper.js';
import slugid from 'slugid';
import taskcluster from '@taskcluster/client';
import request from 'superagent';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  helper.withCfg(mock, skipping);
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
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
    const result = await helper.testClient.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (new client)', async () => {
    const myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: rootCredentials,
    });
    await myClient2.resource();
  });

  test('bewit auth (root creds)', async () => {
    const signedUrl = helper.testClient.buildSignedUrl(
      helper.testClient.resource,
    );
    const res = await request.get(signedUrl);
    assert(res.body.message === 'Hello World');
  });

  test('header auth (no creds)', async () => {
    const myClient2 = new helper.TestClient({ rootUrl: helper.rootUrl, credentials: {} });
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert.equal(err.statusCode, 403, 'expected 403');
    });
  });

  test('header auth (wrong creds)', async () => {
    const myClient2 = new helper.TestClient({
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
    const myClient2 = new helper.TestClient({
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
    const myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry: taskcluster.fromNow('10 min'),
        scopes: ['myapi:*'],
        credentials: rootCredentials,
      }),
    });
    const result = await myClient2.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (temp creds - wrong scope)', async () => {
    const myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry: taskcluster.fromNow('10 min'),
        scopes: ['myapi--'],
        credentials: rootCredentials,
      }),
    });
    await myClient2.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 403, 'expected 403');
    });
  });

  test('header auth (temp creds + authorizedScopes)', async () => {
    const myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry: taskcluster.fromNow('10 min'),
        scopes: ['myapi:*'],
        credentials: rootCredentials,
      }),
      authorizedScopes: ['myapi:resource'],
    });
    const result = await myClient2.resource();
    assert(result.message === 'Hello World');
  });

  test('header auth (temp creds + invalid authorizedScopes)', async () => {
    const myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry: taskcluster.fromNow('10 min'),
        scopes: ['myapi:*'],
        credentials: rootCredentials,
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
    const myClient2 = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry: taskcluster.fromNow('10 min'),
        scopes: ['myapi:'],
        credentials: rootCredentials,
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
    const clientId = slugid.v4();
    const result = await helper.apiClient.createClient(clientId, {
      expires: new Date(3000, 1, 1), // far out in the future
      description: 'Client used by automatic tests, file a bug and delete if' +
                    ' you ever see this client!',
      scopes: ['myapi:*'],
    });

    const myClient = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: {
        clientId: result.clientId,
        accessToken: result.accessToken,
      },
    });
    await myClient.resource();
  });

  test('auth with non-root user (expired)', async () => {
    const clientId = slugid.v4();
    const result = await helper.apiClient.createClient(clientId, {
      expires: new Date(1998, 1, 1), // far back in the past
      description: 'Client used by automatic tests, file a bug and delete if' +
                    ' you ever see this client!',
      scopes: ['myapi:*'],
    });

    const myClient = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: {
        clientId: result.clientId,
        accessToken: result.accessToken,
      },
    });
    await myClient.resource().then(() => {
      assert(false, 'expected an error!');
    }, err => {
      assert(err.statusCode === 401, 'expected 401');
    });
  });
});
