suite('retry-test', function() {
  var taskcluster     = require('../');
  var assert          = require('assert');
  var path            = require('path');
  var debug           = require('debug')('test:retry_test');
  var Promise         = require('promise');
  var _               = require('lodash');
  var _validator      = require('taskcluster-lib-validate');
  var _monitor        = require('taskcluster-lib-monitor');
  var APIBuilder      = require('taskcluster-lib-api');
  var testing         = require('taskcluster-lib-testing');
  var App             = require('taskcluster-lib-app');

  // Construct API
  var builder = new APIBuilder({
    title:        'Retry API',
    description:  'API that sometimes works by retrying things',
    name:         'retrytest',
    version:      'v1',
  });

  var getInternalErrorCount = 0;
  builder.declare({
    method:       'get',
    route:        '/internal-error',
    name:         'getInternalError',
    title:        'Test End-Point',
    scopes:       'test:internal-error',
    description:  'Place we can call to test something',
  }, function(req, res) {
    getInternalErrorCount += 1;
    res
      .status(500)
      .json({
        message: 'Internal error of sorts',
      });
  });

  var getOccasionalInternalErrorCount = 0;
  builder.declare({
    method:       'delete', // Just to ensure that delete works :)
    route:        '/internal-error-sometimes',
    name:         'getOccasionalInternalError',
    title:        'Test End-Point',
    scopes:       'test:internal-error',
    description:  'Place we can call to test something',
  }, function(req, res) {
    getOccasionalInternalErrorCount += 1;
    if (getOccasionalInternalErrorCount > 3) {
      res
        .status(200)
        .json({
          message: 'it worked this time!',
        });
    } else {
      res
        .status(500)
        .json({
          message: 'Internal error of sorts',
        });
    }
  });

  var getUserErrorCount = 0;
  builder.declare({
    method:       'get',
    route:        '/user-error',
    name:         'getUserError',
    title:        'Test End-Point',
    scopes:       'test:internal-error',
    description:  'Place we can call to test something',
  }, function(req, res) {
    getUserErrorCount += 1;
    res
      .status(409)
      .json({
        message: 'User error of sorts',
      });
  });

  var getConnectionErrorCount = 0;
  builder.declare({
    method:       'get',
    route:        '/connection-error',
    name:         'getConnectionError',
    title:        'Test End-Point',
    scopes:       'test:internal-error',
    description:  'Place we can call to test something',
  }, function(req, res) {
    getConnectionErrorCount += 1;
    // Close underlying connection
    req.connection.end();
  });

  // Reference for test api server
  var _apiServer = null;

  var monitor = null;
  var reference = null;
  var Server = null;
  var server = null;
  const rootUrl = 'http://localhost:60526';

  setup(async function() {
    assert(_apiServer === null,       '_apiServer must be null');
    testing.fakeauth.start({
      'test-client': ['auth:credentials', 'test:internal-error'],
    }, {rootUrl});

    monitor = await _monitor({
      projectName: 'tc-client',
      credentials: {},
      mock: true,
    });

    // Create server for api
    const validator = await _validator({
      rootUrl,
      serviceName: 'tc-client-tests',
      folder:         path.join(__dirname, 'schemas'),
    });

    // Create router
    const api = await builder.build({
      rootUrl,
      validator,
    });

    reference = api.reference();
    Server = taskcluster.createClient(reference);
    server = new Server({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token',
      },
      rootUrl,
      monitor,
    });

    // Create application
    _apiServer = await App({
      port:         60526,
      env:          'development',
      forceSSL:     false,
      trustProxy:   false,
      apis: [api],
    });
  });

  // Close server
  teardown(function() {
    testing.fakeauth.stop();
    assert(_apiServer,      '_apiServer doesn\'t exist');
    if (taskcluster.agents.http.destroy) {
      taskcluster.agents.http.destroy();
      taskcluster.agents.https.destroy();
    }
    return _apiServer.terminate().then(function() {
      _apiServer = null;
    });
  });

  test('tries 6 times, delayed', function() {
    getInternalErrorCount = 0;
    setTimeout(function() {
      assert(getInternalErrorCount > 0, 'Haven\'t done retries in 1s!');
      assert(getInternalErrorCount < 6, 'Shouldn\'t have completed 6 yet!');
    }, 1000);
    return server.getInternalError().then(function() {
      assert(false, 'Expected an error');
    }, function(err) {
      assert(err.statusCode === 500);
      assert(getInternalErrorCount === 6, 'expected 6 retries');
    });
  });

  test('Can succeed after 3 attempts', function() {
    getOccasionalInternalErrorCount = 0;
    return server.getOccasionalInternalError().then(function() {
      assert(getOccasionalInternalErrorCount === 4, 'expected 4 attempts');
    });
  });

  test('Can succeed after 3 attempts (record stats)', async function() {
    let m = await _monitor({
      projectName: 'tc-client',
      credentials: {},
      mock: true,
    });
    getOccasionalInternalErrorCount = 0;
    var server2 = new Server({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token',
      },
      rootUrl:        'http://localhost:60526',
      monitor:        m,
    });
    return server2.getOccasionalInternalError().then(function() {
      assert(getOccasionalInternalErrorCount === 4, 'expected 4 attempts');
      assert(_.keys(m.counts).length > 0);
    });
  });

  test('Can set retries = 0', function() {
    var server2 = new Server({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token',
      },
      rootUrl:        'http://localhost:60526',
      retries:        0,
    });
    getInternalErrorCount = 0;
    return server2.getInternalError().then(function() {
      assert(false, 'Expected an error');
    }, function(err) {
      assert(err.statusCode === 500);
      assert(getInternalErrorCount === 1, 'expected 1 attempt only!');
    });
  });

  test('Can set retries = 1', function() {
    var server2 = new Server({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token',
      },
      rootUrl:        'http://localhost:60526',
      retries:        1,
    });
    getInternalErrorCount = 0;
    return server2.getInternalError().then(function() {
      assert(false, 'Expected an error');
    }, function(err) {
      assert(err.statusCode === 500);
      assert(getInternalErrorCount === 2, 'expected 2 attempts');
    });
  });

  test('Doesn\'t retry 4xx errors', function() {
    getUserErrorCount = 0;
    return server.getUserError().then(function() {
      assert(false, 'Expected user error');
    }, function(err) {
      assert(err.statusCode === 409, 'Expect a user error');
      assert(getUserErrorCount === 1, 'only one attempt!');
    });
  });

  test('retries connection errors', function() {
    getConnectionErrorCount = 0;
    setTimeout(function() {
      assert(getConnectionErrorCount > 0, 'Haven\'t done retries in 1s!');
      assert(getConnectionErrorCount < 6, 'Shouldn\'t have completed 6 yet!');
    }, 1000);
    return server.getConnectionError().then(function() {
      assert(false, 'Expected an error');
    }, function(err) {
      assert(err.code === 'ECONNRESET', 'Expect ECONNRESET error');
      assert(getConnectionErrorCount === 6, 'expected 6 retries');
      assert(_.keys(monitor.counts).length > 0);
    });
  });
});
