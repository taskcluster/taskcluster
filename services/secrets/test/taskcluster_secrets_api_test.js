suite("TaskCluster-Secrets", () => {
  var helper = require('./helper');
  var assert = require('assert');
  var slugid = require('slugid');
  var taskcluster = require('taskcluster-client');
  var load = require('../bin/main');

  let testValueExpires  = {
    secret: {data: "bar"},
    expires: taskcluster.fromNowJSON('1 day')
  };
  let testValueExpires2 = {
    secret: {data: "foo"},
    expires: taskcluster.fromNowJSON('1 day')
  };
  let testValueExpired  = {
    secret: {data: "bar"},
    expires: taskcluster.fromNowJSON('- 2 hours')
  };

  const FOO_KEY = slugid.v4();
  const BAR_KEY = slugid.v4();

  let testData = [
    // The "Captain" clients
    {
      testName:   "Captain, write allowed key",
      clientName: "captain-write",
      apiCall:    "set",
      name:       "captain:" + FOO_KEY,
      args:       testValueExpires,
      res:        {}
    },
    {
      testName:   "Captain, write allowed key again",
      clientName: "captain-write",
      apiCall:    "set",
      name:       "captain:" + FOO_KEY,
      args:       testValueExpires,
      res:        {}
    },
    {
      testName:   "Captain, write disallowed key",
      clientName: "captain-write",
      apiCall:    "set",
      name:       "tennille:" + FOO_KEY,
      args:       testValueExpires,
      statusCode: 401 // It's not authorized!
    },
    {
      testName:   "Captain (write only), fail to read.",
      clientName: "captain-write",
      apiCall:    "get",
      name:        "captain:" + FOO_KEY,
      statusCode: 401 // it's not authorized!
    },
    {
      testName:   "Captain (write only), fail to write existing.",
      clientName: "captain-write",
      apiCall:    "set",
      args:       testValueExpires2,
      name:       "captain:" + FOO_KEY,
      statusCode: 409,
      errMessage: "A resource by that name already exists."
    },
    {
      testName:   "Captain (read only), read foo.",
      clientName: "captain-read",
      apiCall:    "get",
      name:       "captain:" + FOO_KEY,
      res:        testValueExpires
    },
    {
      testName:   "Captain, update allowed key",
      clientName: "captain-write",
      apiCall:    "update",
      name:        "captain:" + FOO_KEY,
      args:       testValueExpires2,
      res:        {}
    },
    {
      testName:   "Captain, update a secret that doesn't exist",
      clientName: "captain-write",
      apiCall:    "update",
      name:        "captain:" + FOO_KEY + "Je_n_existe_pas",
      args:       testValueExpires2,
      statusCode: 404,
      errMessage: "Secret not found"
    },
    {
      testName:   "Captain (read only), read updated foo.",
      clientName: "captain-read",
      apiCall:    "get",
      name:        "captain:" + FOO_KEY,
      res:        testValueExpires2
    },
    {
      testName:   "Captain, update allowed key again",
      clientName: "captain-write",
      apiCall:    "update",
      name:        "captain:" + FOO_KEY,
      args:       testValueExpires2,
      res:        {}
    },
    {
      testName:   "Captain (read only), read updated foo again",
      clientName: "captain-read",
      apiCall:    "get",
      name:        "captain:" + FOO_KEY,
      res:        testValueExpires2
    },
    {
      testName:   "Captain (write only), delete foo.",
      clientName: "captain-write",
      apiCall:    "remove",
      name:        "captain:" + FOO_KEY,
      res:        {}
    },
    {
      testName:   "Captain (read only), read deleted foo.",
      clientName: "captain-read",
      apiCall:    "get",
      name:        "captain:" + FOO_KEY,
      statusCode: 404,
      errMessage: "Secret not found"
    },
    {
      testName:   "Captain (write only), delete already deleted foo.",
      clientName: "captain-write",
      apiCall:    "remove",
      name:        "captain:" + FOO_KEY,
      statusCode: 404,
      errMessage: "Secret not found"
    },
    {
      testName:   "Captain (write only), write bar that is expired.",
      clientName: "captain-write",
      apiCall:    "set",
      name:        "captain:" + BAR_KEY,
      args:       testValueExpired,
      res:        {}
    },
    {
      testName:   "Captain (read only), read bar that is expired.",
      clientName: "captain-read",
      apiCall:    "get",
      name:        "captain:" + BAR_KEY,
      statusCode: 410,
      errMessage: "The requested resource has expired."
    },
    {
      testName:   "Captain (write only), delete bar.",
      clientName: "captain-write",
      apiCall:    "remove",
      name:        "captain:" + BAR_KEY,
      res:        {}
    },
  ]

  for (let options of testData) {
    test(options.testName, async () => {
      let client = helper.clients[options.clientName];
      let res = undefined;
      try {
        if (options.args) {
          res = await client[options.apiCall](options.name, options.args);
        } else {
          res = await client[options.apiCall](options.name);
        }
      } catch (e) {
        if (e.statusCode) {
          assert.deepEqual(options.statusCode, e.statusCode);
          if (options.errMessage) {
            assert.deepEqual(options.errMessage, e.body.message);
          }
        } else {
          throw e; // if there's no statusCode this isn't an API error
        }
      }
      for (let key in options.res) {
        assert.deepEqual(res[key], options.res[key]);
      }
    });
  }

  test("Expire secrets", async () => {
    let secrets = helper.clients['captain-read-write'];
    let key = "captain:" + slugid.v4();

    // Create a secret
    await secrets.set(key, {
      secret: {
        message: "keep this secret!!",
        list: ['hello', 'world']
      },
      expires: taskcluster.fromNowJSON('2 hours')
    });

    let {secret} = await secrets.get(key);
    assert.deepEqual(secret, {
      message: "keep this secret!!",
      list: ['hello', 'world']
    });

    // Remember that config/test.js sets the expiration to 4 days into the
    // future so we really expect secrets to be deleted
    await load('expire', {profile: 'test', process: 'test'});

    try {
      await secrets.get(key);
    } catch(err) {
      if (err.statusCode === 404) {
        return;
      }
      throw err;
    }
    assert(false, "Expected an error");
  });

  test("List secrets", async () => {
    let secrets_rw = helper.clients['captain-read-write'];
    let secrets_limited = helper.clients['captain-read-limited'];

    // delete any secrets we can see
    let list = await secrets_rw.list();
    for (let secret of list.secrets) {
      await secrets_rw.remove(secret);
    }

    // assert the list is empty
    list = await secrets_rw.list();
    assert.deepEqual(list, {secrets: []})

    // create some
    await secrets_rw.set('captain:hidden/1', {
      secret: {'sekrit': 1},
      expires: taskcluster.fromNowJSON('2 hours')
    });
    await secrets_rw.set('captain:limited/1', {
      secret: {'less-sekrit': 1},
      expires: taskcluster.fromNowJSON('2 hours')
    });

    // secrets_rw can see both
    list = await secrets_rw.list();
    list.secrets.sort();
    assert.deepEqual(list, {secrets: ['captain:hidden/1', 'captain:limited/1']})

    // the limited client can only see the limited secret, too
    list = await secrets_limited.list();
    list.secrets.sort();
    assert.deepEqual(list, {secrets: ['captain:limited/1']})
  });
});
