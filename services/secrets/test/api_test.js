const helper = require('./helper');
const assert = require('assert');
const slugid = require('slugid');
const data = require('../src/data');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite('api_test.js', ['taskcluster'], function(mock, skipping) {
  let webServer;
  let Secret;

  suiteSetup(async function() {
    webServer = null;
    if (skipping()) {
      return;
    }

    if (mock) {
      helper.load.cfg('azure.accountName', 'inMemory');
    }

    Secret = await helper.load('Secret');
    await Secret.ensureTable();

    webServer = await helper.load('server');
  });

  suiteTeardown(async function() {
    if (webServer) {
      await webServer.terminate();
    }
  });

  // clean out entities before each test and after the suite
  const cleanup = async function() {
    if (!skipping()) {
      await Secret.remove({name: SECRET_NAME}, true);
    }
  };
  setup(cleanup);
  suiteTeardown(cleanup);

  const SECRET_NAME = `captain:${slugid.v4()}`;
  const testValueFoo  = {
    secret: {data: 'bar'},
    expires: taskcluster.fromNowJSON('1 day'),
  };
  const testValueBar = {
    secret: {data: 'foo'},
    expires: taskcluster.fromNowJSON('1 day'),
  };
  const testValueExpired  = {
    secret: {data: 'bar'},
    expires: taskcluster.fromNowJSON('- 2 hours'),
  };

  /**
   * clientName - name of the client to use
   * apiCall - API method name
   * name - secret name
   * args - additional API call arguments
   * res - expected result
   * statusCode - expected non-200 result
   * errMessage - if statusCode is set, error messages should begin with this
   */
  const makeApiCall = async ({clientName, apiCall, name, args, res, statusCode, errMessage}) => {
    let client = helper.clients[clientName];
    let gotRes = undefined;
    try {
      if (args) {
        gotRes = await client[apiCall](name, args);
      } else {
        gotRes = await client[apiCall](name);
      }
    } catch (e) {
      if (e.statusCode) {
        assert(statusCode, `got unexpected error: ${e}`);
        assert.deepEqual(statusCode, e.statusCode);
        if (errMessage) {
          assert(e.body.message.startsWith(errMessage));
        }
        // if there's a payload, the secret should be obscured
        if (e.body.requestInfo && e.body.requestInfo.payload.secret) {
          assert.equal(e.body.requestInfo.payload.secret, '(OMITTED)');
        }
        return;
      } else {
        throw e; // if there's no statusCode this isn't an API error
      }
    }
    assert(!statusCode, 'did not get expected error');
    res && Object.keys(res).forEach(key => {
      assert.deepEqual(gotRes[key], res[key]);
    });
  };

  test('set allowed key (twice)', async function() {
    await makeApiCall({
      clientName: 'captain-write',
      apiCall:    'set',
      name:       SECRET_NAME,
      args:       testValueFoo,
      res:        {},
    });

    // a second call overwrites the value of the secret, without error
    await makeApiCall({
      clientName: 'captain-write',
      apiCall:    'set',
      name:       SECRET_NAME,
      args:       testValueBar,
      res:        {},
    });
  });

  test('set disallowed key', async function() {
    await makeApiCall({
      clientName: 'captain-write',
      apiCall:    'set',
      name:       'some-other-name',
      args:       testValueFoo,
      statusCode: 403, // It's not authorized!
    });
  });

  test('get with only "set" scope fails to read', async function() {
    await helper.clients['captain-write'].set(SECRET_NAME, testValueFoo);
    await makeApiCall({
      clientName: 'captain-write',
      apiCall:    'get',
      name:       SECRET_NAME,
      statusCode: 403, // it's not authorized!
    });
  });

  test('get with read-only scopes reads the secret', async function() {
    await helper.clients['captain-write'].set(SECRET_NAME, testValueFoo);
    await makeApiCall({
      clientName: 'captain-read',
      apiCall:    'get',
      name:       SECRET_NAME,
      res:        testValueFoo,
    });
  });

  test('get with read-only scopes reads an updated secret after set', async function() {
    await helper.clients['captain-write'].set(SECRET_NAME, testValueFoo);
    await helper.clients['captain-write'].set(SECRET_NAME, testValueBar);
    await makeApiCall({
      clientName: 'captain-read',
      apiCall:    'get',
      name:        SECRET_NAME,
      res:        testValueBar,
    });
  });

  test('remove with read-only scopes fails', async function() {
    await helper.clients['captain-write'].set(SECRET_NAME, testValueBar);
    await makeApiCall({
      clientName: 'captain-read',
      apiCall:    'remove',
      name:        SECRET_NAME,
      statusCode: 403, // It's not authorized!
    });
  });

  test('remove with write-only scopes succeeds', async function() {
    await helper.clients['captain-write'].set(SECRET_NAME, testValueBar);
    await makeApiCall({
      clientName: 'captain-write',
      apiCall:    'remove',
      name:        SECRET_NAME,
      res:        {},
    });
    assert(!await Secret.load({name: SECRET_NAME}, true));
  });

  test('getting a missing secret is a 404', async function() {
    await makeApiCall({
      clientName: 'captain-read',
      apiCall:    'get',
      name:        SECRET_NAME,
      statusCode: 404,
      errMessage: 'Secret not found',
    });
  });

  test('deleting a missing secret is a 404', function() {
    return makeApiCall({
      clientName: 'captain-write',
      apiCall:    'remove',
      name:        SECRET_NAME,
      statusCode: 404,
      errMessage: 'Secret not found',
    });
  });

  test('reading an expired secret is a 410', async function() {
    await helper.clients['captain-write'].set(SECRET_NAME, testValueExpired);
    await makeApiCall({
      clientName: 'captain-read',
      apiCall:    'get',
      name:        SECRET_NAME,
      statusCode: 410,
      errMessage: 'The requested resource has expired.',
    });
  });

  test('Expire secrets', async () => {
    let secrets = helper.clients['captain-read-write'];
    let key = 'captain:' + slugid.v4();

    helper.load.save();

    try {
      // Create a secret
      await secrets.set(key, {
        secret: {
          message: 'keep this secret!!',
          list: ['hello', 'world'],
        },
        expires: taskcluster.fromNowJSON('2 hours'),
      });

      let {secret} = await secrets.get(key);
      assert.deepEqual(secret, {
        message: 'keep this secret!!',
        list: ['hello', 'world'],
      });

      // config.yml sets the expiration to 4 days into the
      // future so we really expect secrets to be deleted
      await helper.load('expire');

      try {
        await secrets.get(key);
      } catch (err) {
        if (err.statusCode === 404) {
          return;
        }
        throw err;
      }
      assert(false, 'Expected an error');
    } finally {
      helper.load.restore();
    }
  });

  test('List secrets', async () => {
    let secrets_rw = helper.clients['captain-read-write'];
    let secrets_limited = helper.clients['captain-read-limited'];

    // delete any secrets we can see
    let list = await secrets_rw.list();
    for (let secret of list.secrets) {
      await secrets_rw.remove(secret);
    }

    // assert the list is empty
    list = await secrets_rw.list();
    assert.deepEqual(list, {secrets: []});

    // create some
    await secrets_rw.set('captain:hidden/1', {
      secret: {sekrit: 1},
      expires: taskcluster.fromNowJSON('2 hours'),
    });
    await secrets_rw.set('captain:limited/1', {
      secret: {'less-sekrit': 1},
      expires: taskcluster.fromNowJSON('2 hours'),
    });

    list = await secrets_rw.list();
    list.secrets.sort();
    assert.deepEqual(list, {secrets: ['captain:hidden/1', 'captain:limited/1']});
  });
});
