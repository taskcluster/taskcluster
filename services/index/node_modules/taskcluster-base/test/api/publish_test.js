suite("api/publish", function() {
  var base            = require('../../');
  var aws             = require('aws-sdk-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var mockAuthServer  = require('../mockauthserver');

  // Sanity checks for the reference
  test("reference from mockAuthServer", function() {
    var reference = mockAuthServer.api.reference({
      baseUrl:          'http://localhost:23243/v1'
    });
    assert(reference.entries, "Missing entries");
    assert(reference.entries.length > 0, "Has no entries");
    assert(reference.title, "Missing title");
  });

  // Test publish reference from mockAuthServer
  test("publish reference from mockAuthServer", function() {
    var cfg = base.config({
      envs: [
        'aws_accessKeyId',
        'aws_secretAccessKey',
        'aws_region',
        'aws_apiVersion',
        'referenceTestBucket'
      ],
      filename:               'taskcluster-base-test'
    });

    if (!cfg.get('aws') || !cfg.get('referenceTestBucket')) {
      console.log("Skipping 'publish', missing config file: " +
                  "taskcluster-base-test.conf.json");
      return;
    }

    return mockAuthServer.api.publish({
      baseUrl:              'http://localhost:23243/v1',
      referencePrefix:      'base/test/api.json',
      referenceBucket:      cfg.get('referenceTestBucket'),
      aws:                  cfg.get('aws')
    }).then(function() {
      // Get the file... we don't bother checking the contents this is good
      // enough
      var s3 = new aws.S3(cfg.get('aws'));
      return s3.getObject({
        Bucket:     cfg.get('referenceTestBucket'),
        Key:        'base/test/api.json'
      }).promise();
    }).then(function(res) {
      var reference = JSON.parse(res.data.Body);
      assert(reference.entries, "Missing entries");
      assert(reference.entries.length > 0, "Has no entries");
      assert(reference.title, "Missing title");
    });
  });


  // Test simple method
  test("publish minimal reference", function() {
    var cfg = base.config({
      envs: [
        'aws_accessKeyId',
        'aws_secretAccessKey',
        'aws_region',
        'aws_apiVersion',
        'referenceTestBucket'
      ],
      filename:               'taskcluster-base-test'
    });

    if (!cfg.get('aws') || !cfg.get('referenceTestBucket')) {
      console.log("Skipping 'publish', missing config file: " +
                  "taskcluster-base-test.conf.json");
      return;
    }

    // Create test api
    var api = new base.API({
      title:        "Test Api",
      description:  "Another test api"
    });

    // Declare a simple method
    api.declare({
      method:   'get',
      route:    '/test',
      name:     'test',
      title:    "Test End-Point",
      description:  "Place we can call to test something",
    }, function(req, res) {
      res.send(200, "Hello World");
    });

    return api.publish({
      baseUrl:              'http://localhost:23243/v1',
      referencePrefix:      'base/test/simple-api.json',
      referenceBucket:      cfg.get('referenceTestBucket'),
      aws:                  cfg.get('aws')
    }).then(function() {
      // Get the file... we don't bother checking the contents this is good
      // enough
      var s3 = new aws.S3(cfg.get('aws'));
      return s3.getObject({
        Bucket:     cfg.get('referenceTestBucket'),
        Key:        'base/test/simple-api.json'
      }).promise();
    }).then(function(res) {
      var reference = JSON.parse(res.data.Body);
      assert(reference.entries, "Missing entries");
      assert(reference.entries.length == 1, "Should have one entry");
      assert(reference.title, "Missing title");
    });
  });
});
