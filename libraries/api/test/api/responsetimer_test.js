suite("api/responsetimer", function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var mockAuthServer  = require('../mockauthserver');
  var base            = require('../../');
  var express         = require('express');
  var path            = require('path');

  // Load necessary configuration
  var cfg = base.config({
    envs: [
      'influxdb_connectionString',
    ],
    filename:               'taskcluster-base-test'
  });

  if (!cfg.get('influxdb:connectionString')) {
    console.log("Skipping 'ResponseTimerTest', missing config file: " +
                "taskcluster-base-test.conf.json");
    return;
  }

  // Create test api
  var api = new base.API({
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
    res.status(200).send(req.params.name);
  });

  // Reference to mock authentication server
  var _mockAuthServer = null;
  // Reference for test api server
  var _apiServer = null;

  // Create a mock authentication server
  var influx = null;
  setup(function(){
    assert(_mockAuthServer === null,  "_mockAuthServer must be null");
    assert(_apiServer === null,       "_apiServer must be null");
    return mockAuthServer({
      port:         23243
    }).then(function(server) {
      _mockAuthServer = server;
    }).then(function() {
      // Create server for api
      return base.validator().then(function(validator) {
        influx = new base.stats.Influx({
          connectionString:   cfg.get('influxdb:connectionString')
        });

        // Create router
        var router = api.router({
          validator:      validator,
          credentials: {
            clientId:     'test-client',
            accessToken:  'test-token'
          },
          authBaseUrl:    'http://localhost:23243',
          component:      'ResponseTimerTest',
          drain:           influx
        });

        // Create application
        app = express();

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
    var url = 'http://localhost:23525/single-param/Hello';
    return request
      .get(url)
      .end()
      .then(function(res) {
        assert(influx.pendingPoints() === 1, "Expected just one point");
        return influx.flush();
      }).then(function() {
        assert(influx.pendingPoints() === 0, "Expected points to be cleared");
      });
  });
});