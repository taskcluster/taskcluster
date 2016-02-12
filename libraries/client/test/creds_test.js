suite('client credential handling', function() {
  var base            = require('taskcluster-base');
  var taskcluster     = require('../');
  var assert          = require('assert');
  var path            = require('path');
  var debug           = require('debug')('test:client');
  var request         = require('superagent-promise');
  var _               = require('lodash');

  // This suite exercises the credential-handling functionality of the client
  // against a the auth service's testAuthenticate endpoint.

  let client = function(options) {
    options = _.defaults({}, options || {}, {
      credentials: {},
    });
    options.credentials = _.defaults({}, options.credentials, {
      clientId: 'tester',
      accessToken: 'no-secret',
    });
    return new taskcluster.Auth(options);
  };

  let expectError = (promise, code) => {
    return promise.then(() => {
      assert(false, 'Expected error code: ' + code + ', but got a response');
    }, err => {
      assert(err.code === code, 'Expected error with code: ' + code + ' but got ' + err.code);
    });
  };

  test('simple request', async () => {
    assert.deepEqual(
      await client().testAuthenticate({
        clientScopes: [],
        requiredScopes: [],
      }), {
      clientId: 'tester',
      scopes: [],
    });
  });

  test('bad authentication', async () => {
    await expectError(client({
      credentials: {accessToken: 'wrong'},
    }).testAuthenticate({
      clientScopes: [],
      requiredScopes: [],
    }), 'AuthorizationFailed');
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
      scopes: ['scopes:specific'],
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
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:specific'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'no-secret',
      },
    });
    assert.deepEqual(
      await client({credentials}).testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific'],
      }), {
      clientId: 'tester',
      scopes: ['scopes:specific'],
    });
  });

  test('unnamed temporary credentials, insufficient', async () => {
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:something-else'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'no-secret',
      },
    });
    await expectError(client({credentials}).testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific'],
    }), 'InsufficientScopes');
  });

  test('unnamed temporary credentials, bad authentication', async () => {
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:specific'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'wrong',
      },
    });
    await expectError(client({credentials}).testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific'],
    }), 'AuthorizationFailed');
  });

  test('named temporary credentials', async () => {
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:specific'],
      clientId: 'my-temp-cred',
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'no-secret',
      },
    });
    assert.equal(credentials.clientId, 'my-temp-cred',
                 "temp cred name doesn't appear as clientId");
    assert.deepEqual(
      await client({credentials}).testAuthenticate({
        clientScopes: ['scopes:*', 'auth:create-client:my-temp-cred'],
        requiredScopes: ['scopes:specific'],
      }), {
      clientId: 'my-temp-cred',
      scopes: ['scopes:specific'],
    });
  });

  test('temporary credentials, authorizedScopes', async () => {
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:subcategory:*'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'no-secret',
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
      scopes: ['scopes:subcategory:specific'],
    });
  });

  test('temporary credentials, authorizedScopes, insufficient', async () => {
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:subcategory:*'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'no-secret',
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
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:subcategory:*'],
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'wrong',
      },
    });
    await expectError(client({
        credentials,
        authorizedScopes: ['scopes:subcategory:specific'],
      }).testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:subcategory:specific'],
      }), 'AuthorizationFailed');
  });

  test('named temporary credentials, authorizedScopes', async () => {
    var credentials = taskcluster.createTemporaryCredentials({
      scopes: ['scopes:*'],
      clientId: 'my-temp-cred',
      expiry: taskcluster.fromNow('1 hour'),
      credentials: {
        clientId:       'tester',
        accessToken:    'no-secret',
      },
    });
    assert.equal(credentials.clientId, 'my-temp-cred',
                 "temp cred name doesn't appear as clientId");
    assert.deepEqual(
      await client({
        credentials,
        authorizedScopes: ['scopes:specific', 'scopes:another'],
      }).testAuthenticate({
        clientScopes: ['scopes:*', 'auth:create-client:my-temp-cred'],
        requiredScopes: ['scopes:specific'],
      }), {
      clientId: 'my-temp-cred',
      scopes: ['scopes:specific', 'scopes:another'],
    });
  });

  // for signed URLs, we must use a 'GET' method; see
  // https://github.com/taskcluster/taskcluster-auth/pull/47

  test.skip('buildSignedUrl', async () => {
    let url = client({}).buildSignedUrl(client.currentScopes);
    assert((await request.get(url).end()).ok);
  });


  test.skip('buildSignedUrl with parameter', async () => {
    let url = client.buildSignedUrl(client.param, 'test');
    assert((await request.get(url).end()).ok);
  });

  test.skip('buildSignedUrl with two parameters', async () => {
    let url = client.buildSignedUrl(client.param2, 'test', 'te/st');
    assert((await request.get(url).end()).ok);
  });

  test.skip('buildSignedUrl with missing parameter', async () => {
    try {
      client.buildSignedUrl(client.param2, 'te/st');
    } catch (err) {
      return;
    }
    assert(false);
  });

  test.skip('buildSignedUrl with query-string', async () => {
    let url = client.buildSignedUrl(client.query, {option: 2});
    assert((await request.get(url).end()).ok);
  });

  test.skip('buildSignedUrl with empty query-string', async () => {
    let url = client.buildSignedUrl(client.query, {});
    assert((await request.get(url).end()).ok);
  });

  test.skip('buildSignedUrl with query-string (wrong key)', async () => {
    try {
      client.buildSignedUrl(client.query, {wrongKey: 2});
    } catch (err) {
      return;
    }
    assert(false);
  });

  test.skip('buildSignedUrl with param and query-string', async () => {
    let url = client.buildSignedUrl(client.paramQuery, 'test', {option: 2});
    assert((await request.get(url).end()).ok);
  });

  test.skip('buildSignedUrl with param and no query (when supported)', async () => {
    let url = client.buildSignedUrl(client.paramQuery, 'test', {option: 34});
    assert((await request.get(url).end()).ok);
  });

  test.skip('buildSignedUrl with param and empty query', async () => {
    let url = client.buildSignedUrl(client.paramQuery, 'test', {});
    assert((await request.get(url).end()).ok);
  });

  test.skip('buildSignedUrl with missing parameter, but query options', async () => {
    try {
      client.buildSignedUrl(client.paramQuery, {option: 2});
    } catch (err) {
      return;
    }
    assert(false);
  });

  test.skip('buildSignedUrl for missing method', async () => {
    try {
      client.buildSignedUrl('test');
    } catch (err) {
      return;
    }
    assert(false);
  });

  test.skip('buildSignedUrl authorizedScopes', async () => {
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

  test.skip('buildSignedUrl authorizedScopes (unauthorized)', async () => {
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

  test.skip('buildSignedUrl with temporary credentials', async () => {
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

  test.skip('buildSignedUrl with temporary credentials (unauthorized)', async () => {
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

  test.skip('buildSignedUrl with temporary credentials and expiration', async () => {
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

  test.skip('buildSignedUrl with temporary credentials (expired)', async () => {
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

  test.skip('buildSignedUrl, temp creds + authedScopes ', async () => {
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

  test.skip('buildSignedUrl, temp creds + authedScopes (unauthorized)', async () => {
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
      process.env.TASKCLUSTER_ACCESS_TOKEN = 'no-secret';

      // This is an absolute path to the client.js file. If this file is moved
      // then this obviously will break.  The intent is to re-require the file
      // with the environment variables in place, since they are used at
      // load time
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
      let client = new cleanClient.Auth();
      assert.deepEqual(
        await client.testAuthenticate({
          clientScopes: [],
          requiredScopes: [],
        }), {
        clientId: 'tester',
        scopes: [],
      });
    });
  });
});

