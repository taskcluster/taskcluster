suite("validator", function() {
  var assert  = require('assert');
  var path    = require('path');
  var aws     = require('aws-sdk-promise');
  var base    = require('../');
  var config  = require('taskcluster-lib-config');
  var http    = require('http');


  test("test publish", function() {
    var cfg = config({
      envs: [
        'aws_accessKeyId',
        'aws_secretAccessKey',
        'aws_region',
        'aws_apiVersion',
        'schemaTestBucket'
      ],
      filename:               'taskcluster-base-test'
    });

    if (!cfg.get('aws') || !cfg.get('schemaTestBucket')) {
      throw new Error("Skipping 'publish', missing config file: " +
                      "taskcluster-base-test.conf.json");
    }

    return base.validator({
      publish:        true,
      schemaPrefix:   'base/test/',
      schemaBucket:   cfg.get('schemaTestBucket'),
      aws:            cfg.get('aws'),
      folder:         path.join(__dirname, 'publish-schemas'),
      constants:      {"my-constant": 42},
      schemaBaseUrl:  'http://localhost:1203/'
    }).then(function(validator) {
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/base/test/test-schema.json');
      assert(errors === null, "Got errors");
      var errors = validator.check({
        value: 42
      }, 'http://localhost:1203/base/test/auto-named-schema.json');
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
  });
});
