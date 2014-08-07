suite("api/validate", function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var mockAuthServer  = require('../mockauthserver');
  var base            = require('../../');
  var express         = require('express');
  var path            = require('path');


  // Create test api
  var api = new base.API({
    title:        "Test Api",
    description:  "Another test api"
  });

  // Declare a method we can test input with
  api.declare({
    method:   'get',
    route:    '/test-input',
    name:     'testInput',
    input:    'http://localhost:4321/test-schema.json',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(200).send("Hello World");
  });

  // Declare a method we can use to test valid output
  api.declare({
    method:   'get',
    route:    '/test-output',
    name:     'testInput',
    output:   'http://localhost:4321/test-schema.json',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.reply({value: 4});
  });

  // Declare a method we can use to test invalid output
  api.declare({
    method:   'get',
    route:    '/test-invalid-output',
    name:     'testInput',
    output:   'http://localhost:4321/test-schema.json',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.reply({value: 12});
  });

  // Declare a method we can test input validation skipping on
  api.declare({
    method:   'get',
    route:    '/test-skip-input-validation',
    name:     'testInputSkipInputValidation',
    input:    'http://localhost:4321/test-schema.json',
    skipInputValidation: true,
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(200).send("Hello World");
  });

  // Declare a method we can test output validation skipping on
  api.declare({
    method:   'get',
    route:    '/test-skip-output-validation',
    name:     'testOutputSkipInputValidation',
    output:    'http://localhost:4321/test-schema.json',
    skipOutputValidation: true,
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.reply({value: 12});
  });

  // Reference to mock authentication server
  var _mockAuthServer = null;
  // Reference for test api server
  var _apiServer = null;

  // Create a mock authentication server
  setup(function(){
    assert(_mockAuthServer === null,  "_mockAuthServer must be null");
    assert(_apiServer === null,       "_apiServer must be null");
    return mockAuthServer({
      port:         61243
    }).then(function(server) {
      _mockAuthServer = server;
    }).then(function() {
      // Create validator
      var validatorCreated = base.validator({
        folder:     path.join(__dirname, 'schemas')
      });

      // Create server for api
      return validatorCreated.then(function(validator) {
        // Create router
        var router = api.router({
          validator:      validator,
          credentials: {
            clientId:     'test-client',
            accessToken:  'test-token'
          },
          authBaseUrl:    'http://localhost:61243'
        });

        // Create application
        app = express();

        // Use router
        app.use(router);

        return new Promise(function(accept, reject) {
          var server = app.listen(61515);
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

  // Test valid input
  test("input (valid)", function() {
    var url = 'http://localhost:61515/test-input';
    return request
      .get(url)
      .send({value: 5})
      .end()
      .then(function(res) {
        assert(res.ok, "Request failed");
        assert(res.text === "Hello World", "Got wrong value");
      });
  });

  // Test invalid input
  test("input (invalid)", function() {
    var url = 'http://localhost:61515/test-input';
    return request
      .get(url)
      .send({value: 11})
      .end()
      .then(function(res) {
        assert(res.status === 400, "Request wasn't rejected");
      });
  });

  // Test valid output
  test("output (valid)", function() {
    var url = 'http://localhost:61515/test-output';
    return request
      .get(url)
      .end()
      .then(function(res) {
        assert(res.ok, "Request okay");
        assert(res.body.value === 4, "Got wrong value");
      });
  });

  // test invalid output
  test("output (invalid)", function() {
    var url = 'http://localhost:61515/test-invalid-output';
    return request
      .get(url)
      .end()
      .then(function(res) {
        assert(res.status === 500, "Request wasn't 500");
      });
  });

  // test skipping input validation
  test("skip input validation", function() {
    var url = 'http://localhost:61515/test-skip-input-validation';
    return request
      .get(url)
      .send({value: 100})
      .end()
      .then(function(res) {
        assert(res.ok, "Request failed");
        assert(res.text === "Hello World", "Got wrong value");
      });
  });

  // test skipping output validation
  test("skip output validation", function() {
    var url = 'http://localhost:61515/test-skip-output-validation';
    return request
      .get(url)
      .end()
      .then(function(res) {
        assert(res.ok, "Request failed");
        assert(res.body.value === 12, "Got wrong value");
      });
  });
});
