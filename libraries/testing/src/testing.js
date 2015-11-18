"use strict";

var _             = require('lodash');
var assert        = require('assert');
var childProcess  = require('child_process');
var Promise       = require('promise');
var debug         = require('debug')('base:LocalApp');
var events        = require('events');
var util          = require('util');
var base          = require('./');
var fs            = require('fs');
var path          = require('path');
var uuid          = require('uuid');
var taskcluster   = require('taskcluster-client');
var azureTable    = require('azure-table-node');

/**
 * A utility for test written in mocha, that makes very easy to listen for a
 * specific message.
 *
 * credentials: {
 *   username:     '...',  // Pulse username
 *   password:     '...'   // Pulse password
 * }
 *
 * **Example:**
 * ```js
 * suite("MyTests", function() {
 *   var receiver = new base.testing.PulseTestReceiver({...});
 *
 *
 *   test("create task message arrives", function() {
 *     var taskId = slugid.v4();
 *
 *     // Start listening for a message with the above taskId
 *     return receiver.listenFor(
 *       'my-create-task-message',
 *       queueEvents.taskCreated({taskId: taskId})
 *     ).then(function() {
 *       // We are now listen for a message with the taskId
 *       // So let's create a task with it
 *       return queue.createTask(taskId, {...});
 *     }).then(function() {
 *       // Now we wait for the message to arrive
 *       return receiver.waitFor('my-create-task-message');
 *     }).then(function(message) {
 *       // Now we have the message
 *     });
 *   });
 *
 * });
 * ```
 *
 * The `receiver` object will setup an PulseConnection before all tests and
 * close the PulseConnection after all tests. This should make tests run faster.
 * All internal state, ie. the names given to `listenFor` and `waitFor`
 * will be reset between all tests.
 */
var PulseTestReceiver = function(credentials, mocha) {
  var that = this;
  this._connection        = new taskcluster.PulseConnection(credentials);
  this._listeners         = null;
  this._promisedMessages  = null;

  // **Note**, the before(), beforeEach(9, afterEach() and after() functions
  // below are mocha hooks. Ie. they are called by mocha, that is also the
  // reason that `PulseTestReceiver` only works in the context of a mocha test.
  if (!mocha) {
    mocha = require('mocha');
  }

  // Before all tests we ask the pulseConnection to connect, why not it offers
  // slightly better performance, and we want tests to run fast
  mocha.before(function() {
    return that._connection.connect();
  });

  // Before each test we create list of listeners and mapping from "name" to
  // promised messages
  mocha.beforeEach(function() {
    that._listeners         = [];
    that._promisedMessages  = {};
  });

  // After each test we clean-up all the listeners created
  mocha.afterEach(function() {
    // Because listener is created with a PulseConnection they only have an
    // AMQP channel each, and not a full TCP connection, hence, .close()
    // should be pretty fast too. Also unnecessary as they get clean-up when
    // the PulseConnection closes eventually... But it's nice to keep things
    // clean, errors are more likely to surface at the right test this way.
    return Promise.all(that._listeners.map(function(listener) {
      listener.close();
    })).then(function() {
      that._listeners         = null;
      that._promisedMessages  = null;
    });
  });

  // After all tests we close the PulseConnection, as we haven't named any of
  // the queues, they are all auto-delete queues and will be deleted if they
  // weren't cleaned up in `afterEach()`
  mocha.after(function() {
    return that._connection.close().then(function() {
      that._connection = null;
    });
  });
};


PulseTestReceiver.prototype.listenFor = function(name, binding) {
  // Check that the `name` haven't be used before in this test. Remember
  // that we reset this._promisedMessages beforeEach() test in mocha.
  if (this._promisedMessages[name] !== undefined) {
    throw new Error("name: '" + name + "' have already been used in this test");
  }

  // Create new listener using the existing PulseConnection, so no new TCP
  // connection is opened, it just creates an AMQP channel within the existing
  // TCP connection, this is much faster.
  var listener = new taskcluster.PulseListener({
    connection:     this._connection
  });

  // Add listener to list so we can cleanup later
  this._listeners.push(listener);

  // Create a promise that we got a message
  var gotMessage = new Promise(function(accept, reject) {
    listener.on('message', accept);
    listener.on('error', reject);
  });

  // Insert the promise gotMessage into this._promisedMessages for name, so
  // that we can return it when `.waitFor(name)` is called
  this._promisedMessages[name] = gotMessage;

  // Start listening
  return listener.bind(binding).then(function() {
    return listener.resume().then(function() {
      debug("Started listening for: %s", name);
    });
  });
};


PulseTestReceiver.prototype.waitFor = function(name) {
  // Check that the `name` have been used with listenFor in this test
  if (this._promisedMessages[name] === undefined) {
    throw new Error("listenFor has not been called with name: '" + name + "'" +
                    " in this test!");
  }
  // Otherwise we just return the promise
  return this._promisedMessages[name];
};

// Export PulseTestReceiver
exports.PulseTestReceiver = PulseTestReceiver;


/**
 * Test schemas with a positive and negative test cases. This will run call
 * `setuo` and `test` which is assumed to exist in global scope.
 * Basically, it only makes sense to use from inside `suite` in a mocha test.
 *
 * options:{
 *   validator: {}  // options for base.validator
 *   cases: [
 *     {
 *       schema:    '...json'         // JSON schema identifier to test against
 *       path:      'test-file.json', // Path to test file
 *       success:   true || false     // Is test expected to fail
 *     }
 *   ],
 *   basePath:      path.join(__dirname, 'validate')  // basePath test cases
 *   schemaPrefix:  'http://'         // Prefix for schema identifiers
 * }
 */
var schemas = function(options) {
  options = _.defaults({}, options, {
    schemaPrefix:     ''  // Defaults to no schema prefix
  });

  // Validate options
  assert(options.validator, "Options must be given for validator");
  assert(options.cases instanceof Array, "Array of cases must be given");

  var validator = null;
  setup(function() {
    return base.validator(options.validator).then(function(validator_) {
      validator = validator_;
    });
  });

  // Create test cases
  options.cases.forEach(function(testCase) {
    test(testCase.path, function() {
      // Load test data
      var filePath = testCase.path;
      // Prefix with basePath if a basePath is given
      if (options.basePath) {
        filePath = path.join(options.basePath, filePath);
      }
      var data = fs.readFileSync(filePath, {encoding: 'utf-8'});
      var json = JSON.parse(data);

      // Find schema
      var schema = options.schemaPrefix + testCase.schema;

      // Validate json
      var errors = validator.check(json, schema);

      // Test errors
      if(testCase.success) {
        if (errors !== null) {
          debug("Errors: %j", errors);
        }
        assert(errors === null,
               "Schema doesn't match test for " + testCase.path);
      } else {
        assert(errors !== null,
               "Schema matches unexpectedly test for " + testCase.path);
      }
    });
  });
};

// Export schemas
exports.schemas = schemas;

/** Declare API for mock authentication server */
var mockAuthApi = new base.API({
  title:        "Mock Auth Server",
  description:  "Auth server for testing"
});

/** Declare method to get credentails */
mockAuthApi.declare({
  method:       'get',
  route:        '/client/:clientId/credentials',
  name:         'getCredentials',
  scopes:       [['auth:credentials']],
  title:        "Get Credentials",
  description:  "Mock implementation of getCredentials"
}, function(req, res) {
  var clientId  = req.params.clientId;
  var client    = _.find(this.clients, {clientId: clientId});
  if (!client) {
    res.status(404).json({error: "ClientId not found"});
  }
  res.status(200).json(client);
});

/** Declare method for signature validation */
mockAuthApi.declare({
  method:       'post',
  route:        '/authenticate-hawk',
  name:         'authenticateHawk',
  title:        "Validate Hawk Signature",
  description:  "Mock implementation of authenticateHawk"
}, function(req, res) {
  return this.signatureValidator(req.body).then(function(result) {
    res.status(200).json(result);
  });
});

/** Mock API for azureTableSAS */
mockAuthApi.declare({
  method:       'get',
  route:        '/azure/:account/table/:table/read-write',
  name:         'azureTableSAS',
  deferAuth:    true,
  scopes:       [['auth:azure-table-access:<account>/<table>']],
  title:        "Get Azure SAS",
  description:  "Mock API for azureTableSAS"
}, function(req, res) {
  // Get parameters
  var account = req.params.account;
  var table   = req.params.table;
  var ctx     = this;

  // Check that the client is authorized to access given account and table
  if (!req.satisfies({account: account, table: table})) {
    return;
  }

  // Check that the account exists
  if (!ctx.azureAccounts[account]) {
    // Try to fetch from auth, if not specified directly
    var auth = new taskcluster.Auth({
      credentials:      ctx.credentials,
      baseUrl:          ctx.authBaseUrl
    });
    return auth.azureTableSAS(account, table).then(function(result) {
      return res.reply(result);
    }, function() {
      return res.status(404).json({
        message:    "Account '" + account + "' not found, can't delegate access"
      });
    });
  }

  // Construct client
  var client = azureTable.createClient({
    accountName:    account,
    accountKey:     ctx.azureAccounts[account],
    accountUrl:     ["https://", account, ".table.core.windows.net/"].join('')
  });

  // Ensure that the table is created
  var createdTable = new Promise(function(accept, reject) {
    client.createTable(table, {
      ignoreIfExists:     true
    }, function(err, data) {
      if (err) {
        return reject(err);
      }
      accept(data);
    });
  });

  // Once the table is created, construct and return SAS
  return createdTable.then(function() {
    // Construct SAS
    var expiry  = new Date(Date.now() + 25 * 60 * 1000);
    var sas     = client.generateSAS(table, 'raud', expiry, {
      start:  new Date(Date.now() - 15 * 60 * 1000)
    });

    // Return the generated SAS
    return res.reply({
      sas:      sas,
      expiry:   expiry.toJSON()
    });
  });
});


/** Create a clientLoader with a fixed set of clients */
var createClientLoader = function(clients) {
  return function(clientId) {
    return new Promise(function(accept, reject) {
      var client = _.find(clients, {clientId: clientId});
      if (client) {
        return accept(new base.API.authenticate.Client(client));
      }
      return reject();
    });
  };
};



/**
 * Create an mock authentication server for testing
 *
 * options: {
 *   clients: [
 *      {
 *        clientId:       "...",
 *        accessToken:    "...",
 *        scopes:         [...]
 *      }
 *   ],
 *   azureAccounts: {
 *      "<account>":      "<access-secret>"
 *   },
 *   // If not found in azureAccounts, credentials and authBaseUrl will be used
 *   // to fetch SAS.
 *   credentials: {
 *     clientId:          "...",
 *     accessToken:       "..."
 *   },
 *   authBaseUrl:         "..."   // Defaults to auth.taskcluster.net
 * }
 */
var createMockAuthServer = function(options) {
  // Set default options
  options = _.defaults({}, options || {}, {
    port:           1207,
    env:            'development',
    forceSSL:       false,
    trustProxy:     false,
    clients:        [],
    azureAccounts:  {}
  });

  return base.validator().then(function(validator) {
    // Create application
    var app = base.app(options);

    var signatureValidator = base.API.createSignatureValidator({
      clientLoader: function(clientId) {
        var client = _.find(options.clients, {
          clientId: clientId
        });
        if (!client) {
          throw new Error("No such clientId: " + clientId);
        }
        return client;
      }
    });

    // Create router for the API
    var router =  mockAuthApi.router({
      context: {
        clients:            options.clients,
        azureAccounts:      options.azureAccounts,
        credentials:        options.credentials,
        authBaseUrl:        options.authBaseUrl,
        signatureValidator: signatureValidator
      },
      validator:          validator,
      signatureValidator: signatureValidator
    });

    // Mount router
    app.use('/v1', router);

    // Create server
    return app.createServer().then(function(server) {
      // Time out connections after 500 ms, prevents tests from hanging
      server.setTimeout(500);
      return server;
    });
  });
};

// Export mockAuthApi
createMockAuthServer.mockAuthApi = mockAuthApi;

// Export createMockAuthServer
exports.createMockAuthServer = createMockAuthServer;

/** Return promise that is resolved in `delay` ms */
var sleep = function(delay) {
  return new Promise(function(accept) {
    setTimeout(accept, delay);
  });
};

// Export sleep
exports.sleep = sleep;

/**
 * Poll a function that returns a promise until the promise is resolved without
 * errors. Poll `iterations` number of times, with `delay` ms in between.
 *
 * Defaults to 16 iterations with a delay of 250 ms.
 *
 * Return a promise that a promise form the `poll` function resolved without
 * error. This will return the first successful poll, and stop polling.
 */
var poll = function(doPoll, iterations, delay) {
  return doPoll().catch(function(err) {
    // Re-throw
    if (iterations != undefined && iterations <= 0) {
      throw err;
    }
    return sleep(delay).then(function() {
      return poll(doPoll, (iterations || 20) - 1, delay || 250);
    });
  });
};

// Export poll
exports.poll = poll;
