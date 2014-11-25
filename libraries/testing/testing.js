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
 *     receiver.listenFor('my-create-task-message', queueEvents.taskCreated({
 *       taskId:     taskId
 *     })).then(function() {
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
 * Start an executable that uses the express configuration from from `base.app`
 * to launch an express server and listen for requests.
 *
 * options:
 * {
 *   command:          // Script to execute (with node.js)
 *   args:             // Arguments to pass to subprocess
 *   cwd:              // Current working folder for the subprocess
 *   name:             // Name used for logging
 *   baseUrlPath:      // Path to add after http://localhost:<port>
 * }
 *
 * Note, `LocalApp` is only useful for testing executables that runs an express
 * application as configured in `base.app`. As we rely on a IPC message from
 * the child process to tell us which PORT it's listening on and to know when
 * the child process is ready and listening for requests.
 */
var LocalApp = function(options) {
  events.EventEmitter.call(this);
  this.options = _.defaults({}, options, {
    command:        undefined,
    args:           [],
    cwd:            process.cwd(),
    name:           'LocalApp',
    baseUrlPath:    '/'
  });
  assert(this.options.command, "Command must be given");
  this.onEarlyExit = this.onEarlyExit.bind(this);
};

// Inherit from events.EventEmitter
util.inherits(LocalApp, events.EventEmitter);

/**
 * Launch the command in a subprocess, return a promise with the baseUrl for the
 * server when it listening.
 */
LocalApp.prototype.launch = function() {
  var that = this;
  return new Promise(function(accept, reject) {
    // Generate app instance id so we can start multiple subprocesses
    var appId = uuid.v4();

    // Create subprocess
    that.process = childProcess.fork(that.options.command, that.options.args, {
      env:      _.defaults({
        LOCAL_APP_IDENTIFIER: appId
      }, process.env),
      silent:   false,
      cwd:      that.options.cwd
    });

    // Reject on exit
    that.process.once('exit', reject);

    // Message handler
    var messageHandler = function(message) {
      if (!message.ready || message.appId !== appId) return;

      // Stop listening messages
      that.process.removeListener('message', messageHandler);

      // Stop listening for rejection
      that.process.removeListener('exit', reject);

      // Listen for early exits, these are bad
      that.process.once('exit', that.onEarlyExit);

      // Accept that the server started correctly
      debug("----------- %s Running --------------", that.options.name);
      accept('http://localhost:' + message.port + that.options.baseUrlPath);
    };

    // Listen for the started message
    that.process.on('message', messageHandler);
  });
};

/** Handle early exits */
LocalApp.prototype.onEarlyExit = function() {
  debug("----------- %s Crashed --------------", this.options.name);
  this.process = null;
  this.emit('error', new Error(this.options.name + " process exited early"));
};

/** Terminate local app instance */
LocalApp.prototype.terminate = function() {
  var that = this;
  return new Promise(function(accept) {
    if (!that.process) {
      return accept();
    }
    that.process.removeListener('exit', that.onEarlyExit);
    that.process.once('exit', accept);
    that.process.kill();
    that.process = null;
  }).then(function() {
    debug("----------- %s Terminated -----------", that.options.name);
  });
};


// Export LocalApp
exports.LocalApp = LocalApp;

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
  scopes:       ['auth:credentials'],
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

/** Create an mock authentication server for testing */
var createMockAuthServer = function(options) {
  // Set default options
  options = _.defaults({}, options || {}, {
    port:       1207,
    env:        'development',
    forceSSL:   false,
    trustProxy: false
  });

  return base.validator().then(function(validator) {
    // Create application
    var app = base.app(options);

    // Create router for the API
    var router =  mockAuthApi.router({
      context: {
        clients:      options.clients
      },
      validator:      validator,
      clientLoader:   createClientLoader(options.clients)
    });

    // Mount router
    app.use('/v1', router);

    // Create server
    return app.createServer();
  });
};

// Export mockAuthApi
createMockAuthServer.mockAuthApi = mockAuthApi;

// Export createMockAuthServer
exports.createMockAuthServer = createMockAuthServer;