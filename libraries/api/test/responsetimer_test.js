suite("api/responsetimer", function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var mockAuthServer  = require('taskcluster-lib-testing/.test/mockauthserver');
  var subject         = require('../');
  var monitoring      = require('taskcluster-lib-monitor');
  var validator       = require('taskcluster-lib-validate');
  var express         = require('express');
  var path            = require('path');

  // Create test api
  var api = new subject({
    title:        "Test Api",
    description:  "Another test api"
  });

  api.declare({
    method:   'get',
    route:    '/single-param/:myparam',
    name:     'testParam',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(200).send(req.params.myparam);
  });

  api.declare({
    method:   'get',
    route:    '/slash-param/:name(*)',
    name:     'testSlashParam',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(404).send(req.params.name);
  });

  api.declare({
    method:   'get',
    route:    '/another-param/:name(*)',
    name:     'testAnotherParam',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(500).send(req.params.name);
  });

  // Reference to mock authentication server
  var _mockAuthServer = null;
  // Reference for test api server
  var _apiServer = null;

  var monitor = null;

  setup(function(){
    assert(_mockAuthServer === null,  "_mockAuthServer must be null");
    assert(_apiServer === null,       "_apiServer must be null");
    return mockAuthServer({
      port:         23243
    }).then(function(server) {
      _mockAuthServer = server;
    }).then(function() {
      // Create server for api
      return validator({
        folder:         path.join(__dirname, 'schemas'),
        baseUrl:        'http://localhost:4321/'
      }).then(async function(validator) {
        monitor = await monitoring({
          project: 'tc-lib-api-test',
          credentials: {clientId: 'fake', accessToken: 'fake'},
          mock: true,
        });

        // Create router
        var router = api.router({
          validator:      validator,
          authBaseUrl:    'http://localhost:23243',
          monitor,
        });

        // Create application
        var app = express();

        // Use router
        app.use(router);

        return new Promise(function(accept, reject) {
          var server = app.listen(23525);
          server.once('listening', function() {
            accept(server)
          });
          server.once('error', reject);
          _apiServer = server;
        });
      });
    });
  });

  // Close server
  teardown(function() {
    assert(_mockAuthServer, "_mockAuthServer doesn't exist");
    assert(_apiServer,      "_apiServer doesn't exist");
    return new Promise(function(accept) {
      _apiServer.once('close', function() {
        _apiServer = null;
        accept();
      });
      _apiServer.close();
    }).then(function() {
      return new Promise(function(accept) {
        _mockAuthServer.once('close', function() {
          _mockAuthServer = null;
          accept();
        });
        _mockAuthServer.close();
      });
    });
  });

  test("single parameter", function() {
    return Promise.all([
        request.get('http://localhost:23525/single-param/Hello').end(),
        request.get('http://localhost:23525/single-param/Goodbye').end(),
        request.get('http://localhost:23525/slash-param/Slash').end(),
        request.get('http://localhost:23525/another-param/Another').end(),
      ]).then(function() {
        assert.equal(Object.keys(monitor.counts).length, 6);
        assert.equal(monitor.counts['tc-lib-api-test.api.testParam.success'], 2);
        assert.equal(monitor.counts['tc-lib-api-test.api.testParam.all'], 2);
        assert.equal(monitor.counts['tc-lib-api-test.api.testSlashParam.client-error'], 1);
        assert.equal(monitor.counts['tc-lib-api-test.api.testSlashParam.all'], 1);
        assert.equal(monitor.counts['tc-lib-api-test.api.testAnotherParam.server-error'], 1);
        assert.equal(monitor.counts['tc-lib-api-test.api.testAnotherParam.all'], 1);

        assert.equal(Object.keys(monitor.measures).length, 6);
        assert.equal(monitor.measures['tc-lib-api-test.api.testParam.success'].length, 2);
        assert.equal(monitor.measures['tc-lib-api-test.api.testParam.all'].length, 2);
        assert.equal(monitor.measures['tc-lib-api-test.api.testSlashParam.client-error'].length, 1);
        assert.equal(monitor.measures['tc-lib-api-test.api.testSlashParam.all'].length, 1);
        assert.equal(monitor.measures['tc-lib-api-test.api.testAnotherParam.server-error'].length, 1);
        assert.equal(monitor.measures['tc-lib-api-test.api.testAnotherParam.all'].length, 1);
      });
  });
});
