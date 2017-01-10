suite("api/publish", function() {
  var subject         = require('../');
  var config          = require('taskcluster-lib-config');
  var aws             = require('aws-sdk');
  var assert          = require('assert');
  var Promise         = require('promise');

  var cfg = config({
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
    this.pending = true;
  }

  // Test simple method
  test("publish minimal reference", function() {
    // Create test api
    var api = new subject({
      title:        "Test Api",
      description:  "Another test api"
    });

    // Declare a simple method
    api.declare({
      method:       'get',
      route:        '/test',
      name:         'test',
      title:        "Test End-Point",
      description:  "Place we can call to test something",
      stability:    subject.stability.stable
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
      var reference = JSON.parse(res.Body);
      assert(reference.entries, "Missing entries");
      assert(reference.entries.length == 2, "Should have two entries");
      assert(reference.title, "Missing title");
    });
  });
});
