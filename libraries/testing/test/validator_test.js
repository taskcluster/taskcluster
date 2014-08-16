suite("validator", function() {
  var assert  = require('assert');
  var path    = require('path');
  var aws     = require('aws-sdk-promise');
  var base    = require('../');
  var express = require('express');
  var http    = require('http');
  var fs      = require('fs');
  var Promise = require('promise');

  // Test that we can load from a folder
  test("load from folder (json)", function() {
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
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

  test("test $ref", function() {
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
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
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
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
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
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
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
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
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
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
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
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
    return base.validator({
      publish:      false,
      folder:       path.join(__dirname, 'schemas'),
      constants:    {"my-constant": 42}
    }).then(function(validator) {
      var errors = validator.check({
        value: 43
      }, 'http://localhost:1203/test-schema.json');
      assert(errors !== null, "Got no errors");
    });
  });

  test("test publish", function() {
    var cfg = base.config({
      envs: [
        'aws_accessKeyId',
        'aws_secretAccessKey',
        'aws_region',
        'aws_apiVersion',
        'schemaTestBucket'
      ],
      filename:               'taskcluster-base-test'
    });

    if (cfg.get('aws') && cfg.get('schemaTestBucket')) {
      return base.validator({
        publish:      true,
        schemaPrefix: 'base/test/',
        schemaBucket: cfg.get('schemaTestBucket'),
        aws:          cfg.get('aws'),
        folder:       path.join(__dirname, 'schemas'),
        constants:    {"my-constant": 42}
      }).then(function(validator) {
        var errors = validator.check({
          value: 42
        }, 'http://localhost:1203/test-schema.json');
        assert(errors === null, "Got errors");

        // Get the file... we don't bother checking the contents this is good
        // enough
        var s3 = new aws.S3(cfg.get('aws'));
        return s3.getObject({
          Bucket:     cfg.get('schemaTestBucket'),
          Key:        'base/test/test-schema.json'
        }).promise().then(function() {
          return s3.getObject({
            Bucket:     cfg.get('schemaTestBucket'),
            Key:        'base/test/yaml-test-schema.json'
          }).promise();
        }).then(function() {
          return s3.getObject({
            Bucket:     cfg.get('schemaTestBucket'),
            Key:        'base/test/yml-test-schema.json'
          }).promise();
        });
      });
    } else {
      console.log("Skipping 'publish', missing config file: " +
                  "taskcluster-base-test.conf.json");
    }
  });
});
