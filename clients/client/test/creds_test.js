import taskcluster from '../src/index.js';
import assert from 'node:assert';
import request from 'superagent';
import _ from 'lodash';
import testing from './helper.js';

suite(testing.suiteName(), function() {
  testing.withRestoredEnvVars();

  // This suite exercises the credential-handling functionality of the client
  // against a the auth service's testAuthenticate endpoint.

  const client = function(options) {
    options = _.defaults({}, options || {}, {
      credentials: {},
      rootUrl: process.env.TASKCLUSTER_ROOT_URL || 'https://community-tc.services.mozilla.com/',
    });
    options.credentials = _.defaults({}, options.credentials, {
      clientId: 'tester',
      accessToken: 'no-secret',
    });
    return new taskcluster.Auth(options);
  };

  const expectError = (promise, code) => {
    return promise.then(() => {
      assert(false, `Expected error code: ${code}, but got a response`);
    }, err => {
      assert(err.code === code, `Expected error with code: ${code} but got ${err.code}`);
    });
  };

  test('simple request', async () => {
    assert.deepEqual(
      await client().testAuthenticate({
        clientScopes: [],
        requiredScopes: [],
      }), {
        clientId: 'tester',
        scopes: ['assume:anonymous'],
      });
  });

  test('bad authentication', async () => {
    await expectError(client({
      credentials: { accessToken: 'wrong' },
    }).testAuthenticate({
      clientScopes: [],
      requiredScopes: [],
    }), 'AuthenticationFailed');
  });

  test('bad scopes', async () => {
    await expectError(client().testAuthenticate({
      clientScopes: ['some-scope'],
      requiredScopes: ['another-scope'],
    }), 'InsufficientScopes');
  });

  test('authorizedScopes', async () => {
    assert.deepEqual(
      await client({
        authorizedScopes: ['scopes:specific'],
      }).testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific'],
      }), {
        clientId: 'tester',
        scopes: ['assume:anonymous', 'scopes:specific'],
      });
  });

  test('authorizedScopes, insufficient', async () => {
    await expectError(client({
      authorizedScopes: ['scopes:something-else'],
    }).testAuthenticate({
      clientScopes: ['scopes:*'],
      requiredScopes: ['scopes:specific'],
    }), 'InsufficientScopes');
  });

  test('unnamed temporary credentials', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:specific'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    assert.deepEqual(
      await client({ credentials }).testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific'],
      }), {
        clientId: 'tester',
        scopes: ['assume:anonymous', 'scopes:specific'],
      });
  });

  test('unnamed temporary credentials, insufficient', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:something-else'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    await expectError(client({ credentials }).testAuthenticate({
      clientScopes: ['scopes:*'],
      requiredScopes: ['scopes:specific'],
    }), 'InsufficientScopes');
  });

  test('unnamed temporary credentials, bad authentication', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:specific'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'wrong',
      },
    });
    await expectError(client({ credentials }).testAuthenticate({
      clientScopes: ['scopes:*'],
      requiredScopes: ['scopes:specific'],
    }), 'AuthenticationFailed');
  });

  test('named temporary credentials', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:specific'],
      clientId: 'my-temp-cred',
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    assert.equal(credentials.clientId, 'my-temp-cred',
      'temp cred name doesn\'t appear as clientId');
    assert.deepEqual(
      await client({ credentials }).testAuthenticate({
        clientScopes: ['scopes:*', 'auth:create-client:my-temp-cred'],
        requiredScopes: ['scopes:specific'],
      }), {
        clientId: 'my-temp-cred',
        scopes: ['assume:anonymous', 'scopes:specific'],
      });
  });

  test('temporary credentials, authorizedScopes', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:subcategory:*'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    assert.deepEqual(
      await client({
        credentials,
        authorizedScopes: ['scopes:subcategory:specific'],
      }).testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:subcategory:specific'],
      }), {
        clientId: 'tester',
        scopes: ['assume:anonymous', 'scopes:subcategory:specific'],
      });
  });

  test('temporary credentials, authorizedScopes, insufficient', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:subcategory:*'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    await expectError(client({
      credentials,
      authorizedScopes: ['scopes:subcategory:wrong-scope'],
    }).testAuthenticate({
      clientScopes: ['scopes:*'],
      requiredScopes: ['scopes:subcategory:specific'],
    }), 'InsufficientScopes');
  });

  test('temporary credentials, authorizedScopes, bad authentication', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:subcategory:*'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'wrong',
      },
    });
    await expectError(client({
      credentials,
      authorizedScopes: ['scopes:subcategory:specific'],
    }).testAuthenticate({
      clientScopes: ['scopes:*'],
      requiredScopes: ['scopes:subcategory:specific'],
    }), 'AuthenticationFailed');
  });

  test('named temporary credentials, authorizedScopes', async () => {
    const credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:*'],
      clientId: 'my-temp-cred',
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    assert.equal(credentials.clientId, 'my-temp-cred',
      'temp cred name doesn\'t appear as clientId');
    assert.deepEqual(
      await client({
        credentials,
        authorizedScopes: ['scopes:specific', 'scopes:another'],
      }).testAuthenticate({
        clientScopes: ['scopes:*', 'auth:create-client:my-temp-cred'],
        requiredScopes: ['scopes:specific'],
      }), {
        clientId: 'my-temp-cred',
        scopes: ['assume:anonymous', 'scopes:specific', 'scopes:another'],
      });
  });

  const getJson = async function(url) {
    const res = await request.get(url);
    return res.body;
  };

  test('buildSignedUrl', async () => {
    const cl = client();
    const url = cl.buildSignedUrl(cl.testAuthenticateGet);
    assert((await request.get(url)).ok);
  });

  test('buildSignedUrl authorizedScopes', async () => {
    const cl = client({
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
      authorizedScopes: ['test:authenticate-get', 'test:foo'],
    });
    const url = cl.buildSignedUrl(cl.testAuthenticateGet);
    assert.deepEqual((await getJson(url)).scopes,
      ['assume:anonymous', 'test:authenticate-get', 'test:foo']);
  });

  test('buildSignedUrl authorizedScopes (unauthorized)', async () => {
    const cl = client({
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
      authorizedScopes: ['test:get'], // no test:authenticate-get
    });
    const url = cl.buildSignedUrl(cl.testAuthenticateGet);
    await request.get(url).then(() => assert(false), err => {
      assert(err.response.statusCode === 403);
    });
  });

  test('buildSignedUrl with temporary credentials', async () => {
    const tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:authenticate-get', 'test:bar'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    const cl = client({
      credentials: tempCreds,
    });
    const url = cl.buildSignedUrl(cl.testAuthenticateGet);
    assert.deepEqual((await getJson(url)).scopes,
      ['assume:anonymous', 'test:authenticate-get', 'test:bar']);
  });

  test('buildSignedUrl with temporary credentials and expiration', async () => {
    const tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:authenticate-get'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    const cl = client({
      credentials: tempCreds,
    });
    const url = cl.buildSignedUrl(cl.testAuthenticateGet, {
      expiration: 600,
    });
    assert((await request.get(url)).ok);
  });

  test('buildSignedUrl with temporary credentials (expired)', async () => {
    const tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:query', 'test:authenticate-get'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    const cl = client({
      credentials: tempCreds,
    });
    const url = cl.buildSignedUrl(cl.testAuthenticateGet, {
      expiration: -600, // This seems to work, not sure how long it will work...
    });
    await request.get(url).then(() => assert(false), err => {
      assert(err.response.statusCode === 401);
    });
  });

  test('buildSignedUrl, temp creds + authedScopes ', async () => {
    const tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test:auth*'],
      expiry: new Date(new Date().getTime() + 60 * 1000),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
    });
    const cl = client({
      credentials: tempCreds,
      authorizedScopes: ['test:authenticate-get'],
    });
    const url = cl.buildSignedUrl(cl.testAuthenticateGet);
    assert.deepEqual((await getJson(url)).scopes, ['assume:anonymous', 'test:authenticate-get']);
  });

  suite('Get with credentials from environment variables', async () => {
    setup(() => {
      process.env.TASKCLUSTER_ROOT_URL = process.env.TASKCLUSTER_ROOT_URL || 'https://community-tc.services.mozilla.com/';
      process.env.TASKCLUSTER_CLIENT_ID = 'tester';
      process.env.TASKCLUSTER_ACCESS_TOKEN = 'no-secret';
    });

    test('fromEnvVars with only rootUrl', async () => {
      delete process.env.TASKCLUSTER_CLIENT_ID;
      delete process.env.TASKCLUSTER_ACCESS_TOKEN;
      assert.deepEqual(taskcluster.fromEnvVars(),
        { rootUrl: process.env.TASKCLUSTER_ROOT_URL });
    });

    test('fromEnvVars with only accessToken', async () => {
      delete process.env.TASKCLUSTER_ROOT_URL;
      delete process.env.TASKCLUSTER_CLIENT_ID;
      assert.deepEqual(taskcluster.fromEnvVars(),
        { credentials: { accessToken: 'no-secret' } });
    });

    test('fromEnvVar credentials', async () => {
      const client = new taskcluster.Auth(taskcluster.fromEnvVars());
      assert.deepEqual(
        await client.testAuthenticate({
          clientScopes: [],
          requiredScopes: [],
        }), {
          clientId: 'tester',
          scopes: ['assume:anonymous'],
        });
    });
  });
});
