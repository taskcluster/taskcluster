suite("validator", function() {
  var assert  = require('assert');
  var path    = require('path');
  var base    = require('../');
  var express = require('express');
  var http    = require('http');
  var fs      = require('fs');
  var Promise = require('promise');
  var debug   = require('debug')('test:validator');

  // Common options for loading schemas in all tests
  var opts = {
    publish:        false,
    folder:         path.join(__dirname, 'schemas'),
    constants:      {"my-constant": 42},
    schemaBaseUrl:  'http://localhost:1203/'
  };

  // Test that we can load from a folder
  test("load from folder (json)", function() {
    return base.validator(opts).then(function(validator) {
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/test-schema.json');
      if(errors) {
        console.log("Got unexpected errors:");
        console.log(JSON.stringify(errors, null, 2));
      }
      assert(errors === null, "Got errors");
    });
  });

  test("load from folder (invalid schema -> error)", function() {
    try {
      base.validator({
        publish:        false,
        folder:         path.join(__dirname, 'invalid-schemas'),
        constants:      {"my-constant": 42},
        schemaBaseUrl:  'http://localhost:1203/'
      });
      assert(false, "Expected an error");
    } catch (err) {
      debug("Expected error: %j", err);
      assert(err && err.error, "Expected an validation error");
    }
  });

  test("test $ref", function() {
    return base.validator(opts).then(function(validator) {
      var errors = validator.check({
        reference: {
          value: 42
        },
        tid:  new Date().toJSON()
      }, 'http://localhost:1203/ref-test-schema.json');
      if(errors) {
        console.log("Got unexpected errors:");
        console.log(JSON.stringify(errors, null, 2));
      }
      assert(errors === null, "Got errors");
    });
  });

  test("test default values (no key provided)", function() {
    return base.validator(opts).then(function(validator) {
      var json = {
        value: 42
      };
      var errors = validator.check(
        json,
        'http://localhost:1203/default-schema.json'
      );
      if(errors) {
        console.log("Got unexpected errors:");
        console.log(JSON.stringify(errors, null, 2));
      }
      assert(errors === null, "Got errors");
      assert(json.value === 42, "value didn't change");
      assert(json.optionalValue === 'my-default-value',
             "didn't get default value");
    });
  });

  test("test default values (value provided)", function() {
    return base.validator(opts).then(function(validator) {
      var json = {
        value: 42,
        optionalValue: "procided-value"
      };
      var errors = validator.check(
        json,
        'http://localhost:1203/default-schema.json'
      );
      if(errors) {
        console.log("Got unexpected errors:");
        console.log(JSON.stringify(errors, null, 2));
      }
      assert(errors === null, "Got errors");
      assert(json.value === 42, "value didn't change");
      assert(json.optionalValue === 'procided-value',
             "got default value");
    });
  });

  test("test default values (array and object)", function() {
    return base.validator(opts).then(function(validator) {
      var json = {};
      var errors = validator.check(
        json,
        'http://localhost:1203/default-array-obj-schema.json'
      );
      if(errors) {
        console.log("Got unexpected errors:");
        console.log(JSON.stringify(errors, null, 2));
      }
      assert(errors === null, "Got errors");
      assert(json.optObj.hello === 'world', "didn't get default value");
      assert(json.optArray.length === 1, "didn't get default value");
      assert(json.optArray[0] === 'my-default-value',
             "didn't get default value");
      assert(json.optEmpty.length === 0, "didn't get default value");
    });
  });

  test("load from folder (yml)", function() {
    return base.validator(opts).then(function(validator) {
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/yml-test-schema.json');
      if(errors) {
        console.log("Got unexpected errors:");
        console.log(JSON.stringify(errors, null, 2));
      }
      assert(errors === null, "Got errors");
    });
  });

  test("load from folder (yaml)", function() {
    return base.validator(opts).then(function(validator) {
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/yaml-test-schema.json');
      if(errors) {
        console.log("Got unexpected errors:");
        console.log(JSON.stringify(errors, null, 2));
      }
      assert(errors === null, "Got errors");
    });
  });

  // Test that we can preload from a url
  test("preload from url", function() {
    // Create a simple server that serves test-schema.json
    var app = express();
    app.get('/test-schema.json', function(req, res) {
      var fileName = path.join(__dirname, 'schemas', 'test-schema.json');
      res.status(200).json(
        JSON.parse(fs.readFileSync(fileName, {encoding: 'utf8'}))
      );
    });

    // Start server
    var server = http.createServer(app);
    var serverRunning = new Promise(function(accept, reject) {
      server.once('error',      reject);
      server.once('listening',  accept);
      server.listen(1203);
    });

    var validator = null;
    return serverRunning.then(function() {
      return base.validator({
        publish:      false,
        preload: [
          'http://localhost:1203/test-schema.json'
        ]
      });
    }).then(function(validator_) {
      validator = validator_
      return new Promise(function(accept) {
        server.close(accept);
      });
    }).then(function() {
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/test-schema.json');
      assert(errors === null, "Got errors");
    });
  });

  // Sometimes we have no schemas to load, but need a validator
  test("create empty validator", function() {
    return base.validator().then(function(validator) {
      assert(validator, "Didn't get a validator");
    });
  });

  test("find errors", function() {
    return base.validator(opts).then(function(validator) {
      var errors = validator.check({
        value: 43
      }, 'http://localhost:1203/test-schema.json');
      assert(errors !== null, "Got no errors");
    });
  });

  test("can validate", function() {
    return base.validator(opts).then(function(validator) {
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/test-schema.json');
      assert(errors === null, "Got errors");
    });
  });

  test("automatically set schema.id", function() {
    return base.validator(opts).then(function(validator) {
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/auto-named-schema.json');
      assert(errors === null, "Got errors");
    });
  });
});
