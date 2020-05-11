const taskcluster = require('../');
const assert = require('assert');
const SchemaSet = require('taskcluster-lib-validate');
const {APIBuilder} = require('taskcluster-lib-api');
const testing = require('taskcluster-lib-testing');
const {App} = require('taskcluster-lib-app');
const {monitorManager, monitor} = require('./monitor');

const rootUrl = `http://localhost:60526`;

suite(testing.suiteName(), function() {
  let proxier;

  // Construct API
  let builder = new APIBuilder({
    title: 'Retry API',
    description: 'API that sometimes works by retrying things',
    serviceName: 'retrytest',
    apiVersion: 'v1',
  });

  let getInternalErrorCount = 0;
  builder.declare({
    method: 'get',
    route: '/internal-error',
    name: 'getInternalError',
    title: 'Test End-Point',
    scopes: 'test:internal-error',
    category: 'Taskcluster Client',
    description: 'Place we can call to test something',
  }, function(req, res) {
    getInternalErrorCount += 1;
    res
      .status(500)
      .json({
        message: 'Internal error of sorts',
      });
  });

  let getOccasionalInternalErrorCount = 0;
  builder.declare({
    method: 'delete', // Just to ensure that delete works :)
    route: '/internal-error-sometimes',
    name: 'getOccasionalInternalError',
    title: 'Test End-Point',
    category: 'Taskcluster Client',
    scopes: 'test:internal-error',
    description: 'Place we can call to test something',
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

  let getUserErrorCount = 0;
  builder.declare({
    method: 'get',
    route: '/user-error',
    name: 'getUserError',
    title: 'Test End-Point',
    category: 'Taskcluster Client',
    scopes: 'test:internal-error',
    description: 'Place we can call to test something',
  }, function(req, res) {
    getUserErrorCount += 1;
    res
      .status(409)
      .json({
        message: 'User error of sorts',
      });
  });

  let getConnectionErrorCount = 0;
  builder.declare({
    method: 'get',
    route: '/connection-error',
    name: 'getConnectionError',
    title: 'Test End-Point',
    scopes: 'test:internal-error',
    category: 'Taskcluster Client',
    description: 'Place we can call to test something',
  }, function(req, res) {
    getConnectionErrorCount += 1;
    // Close underlying connection
    req.connection.end();
  });

  // Reference for test api server
  let _apiServer = null;

  let Server = null;
  let server = null;

  setup(async function() {
    assert(_apiServer === null, '_apiServer must be null');
    testing.fakeauth.start({
      'test-client': ['auth:credentials', 'test:internal-error'],
    }, {rootUrl});

    // Create server for api
    const schemaset = new SchemaSet({
      serviceName: 'retrytest',
    });

    // Create router
    const api = await builder.build({
      rootUrl,
      schemaset,
      monitor,
    });

    Server = taskcluster.createClient(builder.reference());
    server = new Server({
      credentials: {
        clientId: 'test-client',
        accessToken: 'test-token',
      },
      rootUrl,
    });

    // Create application
    _apiServer = await App({
      port: 60526,
      env: 'development',
      forceSSL: false,
      trustProxy: false,
      apis: [api],
    });
  });

  // Close server
  teardown(function() {
    monitorManager.reset();
    testing.fakeauth.stop();
    assert(_apiServer, '_apiServer doesn\'t exist');
    if (proxier) {
      proxier.close();
      proxier = null;
    }
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
    getOccasionalInternalErrorCount = 0;
    let server2 = new Server({
      credentials: {
        clientId: 'test-client',
        accessToken: 'test-token',
      },
      rootUrl: 'http://localhost:60526',
    });
    return server2.getOccasionalInternalError().then(function() {
      assert(getOccasionalInternalErrorCount === 4, 'expected 4 attempts');
      assert(monitorManager.messages.length > 0);
    });
  });

  test('Can set retries = 0', function() {
    let server2 = new Server({
      credentials: {
        clientId: 'test-client',
        accessToken: 'test-token',
      },
      rootUrl: 'http://localhost:60526',
      retries: 0,
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
    let server2 = new Server({
      credentials: {
        clientId: 'test-client',
        accessToken: 'test-token',
      },
      rootUrl: 'http://localhost:60526',
      retries: 1,
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
      assert(monitorManager.messages.length > 0);
    });
  });
});
