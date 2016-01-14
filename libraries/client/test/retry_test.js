suite('retry-test', function() {
  var base            = require('taskcluster-base');
  var taskcluster     = require('../');
  var assert          = require('assert');
  var path            = require('path');
  var debug           = require('debug')('test:retry_test');
  var request         = require('superagent-promise');
  var Promise         = require('promise');

  // Construct API
  var api = new base.API({
    title:        "Retry API",
    description:  "API that sometimes works by retrying things"
  });

  var getInternalErrorCount = 0;
  api.declare({
    method:       'get',
    route:        '/internal-error',
    name:         'getInternalError',
    title:        "Test End-Point",
    scopes:       [['test:internal-error']],
    deferAuth:    false,
    description:  "Place we can call to test something",
  }, function(req, res) {
    getInternalErrorCount += 1;
    res
      .status(500)
      .json({
        message: "Internal error of sorts"
      });
  });

  var getOccasionalInternalErrorCount = 0;
  api.declare({
    method:       'delete', // Just to ensure that delete works :)
    route:        '/internal-error-sometimes',
    name:         'getOccasionalInternalError',
    title:        "Test End-Point",
    scopes:       [['test:internal-error']],
    deferAuth:    false,
    description:  "Place we can call to test something",
  }, function(req, res) {
    getOccasionalInternalErrorCount += 1;
    if (getOccasionalInternalErrorCount > 3) {
      res
        .status(200)
        .json({
          message: "it worked this time!"
        });
    } else {
      res
        .status(500)
        .json({
          message: "Internal error of sorts"
        });
    }
  });

  var getUserErrorCount = 0;
  api.declare({
    method:       'get',
    route:        '/user-error',
    name:         'getUserError',
    title:        "Test End-Point",
    scopes:       [['test:internal-error']],
    deferAuth:    false,
    description:  "Place we can call to test something",
  }, function(req, res) {
    getUserErrorCount += 1;
    res
      .status(409)
      .json({
        message: "User error of sorts"
      });
  });


  var getConnectionErrorCount = 0;
  api.declare({
    method:       'get',
    route:        '/connection-error',
    name:         'getConnectionError',
    title:        "Test End-Point",
    scopes:       [['test:internal-error']],
    deferAuth:    false,
    description:  "Place we can call to test something",
  }, function(req, res) {
    getConnectionErrorCount += 1;
    // Close underlying connection
    req.connection.end();
  });


  // Reference to mock authentication server
  var _mockAuthServer = null;
  // Reference for test api server
  var _apiServer = null;
  // Reference last stats record
  var lastRecord = null;

  // Create a mock authentication server
  setup(function() {
    lastRecord = null;
    assert(_mockAuthServer === null,  "_mockAuthServer must be null");
    assert(_apiServer === null,       "_apiServer must be null");
    return base.testing.createMockAuthServer({
      port:     60243,
      clients: [
        {
          clientId:     'test-client',
          accessToken:  'test-token',
          scopes:       ['auth:credentials', 'test:internal-error'],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }
      ]
    }).then(function(server) {
      _mockAuthServer = server;
    }).then(function() {
      // Create server for api
      return base.validator().then(function(validator) {
        // Create router
        var router = api.router({
          validator:      validator,
          credentials: {
            clientId:     'test-client',
            accessToken:  'test-token'
          },
          authBaseUrl:    'http://localhost:60243/v1'
        });

        // Create application
        var app = base.app({
          port:         60526,
          env:          'development',
          forceSSL:     false,
          trustProxy:   false
        });

        // Use router
        app.use('/v1', router);

        return app.createServer().then(function(server) {
          _apiServer = server;
        });
      });
    });
  });

  // Close server
  teardown(function() {
    assert(_mockAuthServer, "_mockAuthServer doesn't exist");
    assert(_apiServer,      "_apiServer doesn't exist");
    if (taskcluster.agents.http.destroy) {
      taskcluster.agents.http.destroy();
      taskcluster.agents.https.destroy();
    }
    return _apiServer.terminate().then(function() {
      _apiServer = null;
      return _mockAuthServer.terminate().then(function() {
        _mockAuthServer = null;
      });
    });
  });

  var reference = api.reference({baseUrl: 'http://localhost:60526/v1'});
  var Server = taskcluster.createClient(reference);
  var server = new Server({
    credentials: {
      clientId:     'test-client',
      accessToken:  'test-token'
    },
    baseUrl:        'http://localhost:60526/v1',
    stats: function(r) {lastRecord = r;}
  });

  test("tries 6 times, delayed", function() {
    getInternalErrorCount = 0;
    setTimeout(function() {
      assert(getInternalErrorCount > 0, "Haven't done retries in 1s!");
      assert(getInternalErrorCount < 6, "Shouldn't have completed 6 yet!");
    }, 1000);
    return server.getInternalError().then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      assert(err.statusCode === 500);
      assert(getInternalErrorCount === 6, "expected 6 retries");
    });
  });

  test("Can succeed after 3 attempts", function() {
    getOccasionalInternalErrorCount = 0;
    return server.getOccasionalInternalError().then(function() {
      assert(getOccasionalInternalErrorCount === 4, "expected 4 attempts");
    });
  });

  test("Can succeed after 3 attempts (record stats)", function() {
    getOccasionalInternalErrorCount = 0;
    var record = null;
    var server2 = new Server({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token'
      },
      baseUrl:        'http://localhost:60526/v1',
      stats: function(r) {
        assert(record === null, "Got two stats records!");
        record = r;
      }
    });
    return server2.getOccasionalInternalError().then(function() {
      assert(getOccasionalInternalErrorCount === 4, "expected 4 attempts");
      assert(record, "Expected an error record for stats");
      assert(record.duration > 20, "Error in record.duration");
      assert(record.retries === 3, "Error in record.retries");
      assert(record.success === 1, "Error in record.success");
      assert(record.resolution === 'http-200', "Error in record.resolution");
      assert(record.baseUrl, "Error in record.baseUrl");
    });
  });

  test("Can set retries = 0", function() {
    var server2 = new Server({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token'
      },
      baseUrl:        'http://localhost:60526/v1',
      retries:        0
    });
    getInternalErrorCount = 0;
    return server2.getInternalError().then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      assert(err.statusCode === 500);
      assert(getInternalErrorCount === 1, "expected 1 attempt only!");
    });
  });

  test("Can set retries = 1", function() {
    var server2 = new Server({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token'
      },
      baseUrl:        'http://localhost:60526/v1',
      retries:        1
    });
    getInternalErrorCount = 0;
    return server2.getInternalError().then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      assert(err.statusCode === 500);
      assert(getInternalErrorCount === 2, "expected 2 attempts");
    });
  });

  test("Doesn't retry 4xx errors", function() {
    getUserErrorCount = 0;
    return server.getUserError().then(function() {
      assert(false, "Expected user error");
    },function(err) {
      assert(err.statusCode === 409, "Expect a user error");
      assert(getUserErrorCount === 1, "only one attempt!");
    });
  });

  test("retries connection errors", function() {
    getConnectionErrorCount = 0;
    setTimeout(function() {
      assert(getConnectionErrorCount > 0, "Haven't done retries in 1s!");
      assert(getConnectionErrorCount < 6, "Shouldn't have completed 6 yet!");
    }, 1000);
    return server.getConnectionError().then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      assert(err.code === 'ECONNRESET', "Expect ECONNRESET error");
      assert(getConnectionErrorCount === 6, "expected 6 retries");
      assert(lastRecord, "Expected a stats record");
      assert(lastRecord.resolution === 'ECONNRESET', "Expected ECONNRESET");
      assert(lastRecord.duration > 0, "Expected a non-zero duration");
      assert(lastRecord.retries > 0, "Expected a non-zero duration");
    });
  });
});