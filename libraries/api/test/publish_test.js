suite('api/publish', function() {
  var subject         = require('../');
  var config          = require('typed-env-config');
  var aws             = require('aws-sdk');
  var assert          = require('assert');
  var Promise         = require('promise');

  var cfg = config({});

  if (!cfg.aws || !cfg.referenceTestBucket) {
    console.log('Skipping \'publish\', missing config file: ' +
                'taskcluster-base-test.conf.json');
    this.pending = true;
  }

  // Test simple method
  test('publish minimal reference', function() {
    // Create test api
    var api = new subject({
      title:        'Test Api',
      description:  'Another test api',
      name:         'test',
    });

    // Declare a simple method
    api.declare({
      method:       'get',
      route:        '/test0',
      name:         'test0',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
    }, function(req, res) {
      res.send(200, 'Hello World');
    });

    // Declare some methods with some fun scopes
    api.declare({
      method:       'get',
      route:        '/test1',
      name:         'test1',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AllOf: ['foo:bar']},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test2',
      name:         'test2',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AnyOf: ['foo:bar']},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test3',
      name:         'test3',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {if: 'not_public', then: {AllOf: ['foo:bar']}},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test4',
      name:         'test4',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AllOf: [{for: 'foo', in: 'whatever', each: 'bar:<foo>'}]},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test5',
      name:         'test5',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AllOf: [{for: 'foo', in: 'whatever', each: 'bar:<foo>'}]},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test6',
      name:         'test6',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {if: 'not_public', then: {AllOf: ['abc', {AnyOf: ['e']}, {for: 'a', in: 'b', each: 'c'}]}},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });

    return api.publish({
      baseUrl:              'http://localhost:23243/v1',
      referencePrefix:      'base/test/simple-api.json',
      referenceBucket:      cfg.referenceTestBucket,
      aws:                  cfg.aws,
    }).then(function() {
      // Get the file... we don't bother checking the contents this is good
      // enough
      var s3 = new aws.S3(cfg.aws);
      return s3.getObject({
        Bucket:     cfg.referenceTestBucket,
        Key:        'base/test/simple-api.json',
      }).promise();
    }).then(function(res) {
      var reference = JSON.parse(res.Body);
      assert(reference.entries, 'Missing entries');
      assert.equal(reference.entries.length, 8);
      assert(reference.title, 'Missing title');
    });
  });
});
