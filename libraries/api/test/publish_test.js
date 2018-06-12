const APIBuilder      = require('../');
const config          = require('typed-env-config');
const aws             = require('aws-sdk');
const assert          = require('assert');
const libUrls         = require('taskcluster-lib-urls');

suite('api/publish', function() {
  const cfg = config({});

  if (!cfg.aws || !cfg.referenceTestBucket) {
    console.log('Skipping \'publish\', missing config file: ' +
                'taskcluster-base-test.conf.json');
    this.pending = true;
  }

  // Test simple method
  test('publish minimal reference', async function() {
    // Create test api
    const builder = new APIBuilder({
      title:        'Test Api',
      description:  'Another test api',
      serviceName:  'test',
      version:      'v1',
    });

    // Declare a simple method
    builder.declare({
      method:       'get',
      route:        '/test0',
      name:         'test0',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    APIBuilder.stability.stable,
    }, function(req, res) {
      res.send(200, 'Hello World');
    });

    // Declare some methods with some fun scopes
    builder.declare({
      method:       'get',
      route:        '/test1',
      name:         'test1',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    APIBuilder.stability.stable,
      scopes:       {AllOf: ['foo:bar']},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    builder.declare({
      method:       'get',
      route:        '/test2',
      name:         'test2',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    APIBuilder.stability.stable,
      scopes:       {AnyOf: ['foo:bar']},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    builder.declare({
      method:       'get',
      route:        '/test3',
      name:         'test3',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    APIBuilder.stability.stable,
      scopes:       {if: 'not_public', then: {AllOf: ['foo:bar']}},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    builder.declare({
      method:       'get',
      route:        '/test4',
      name:         'test4',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    APIBuilder.stability.stable,
      scopes:       {AllOf: [{for: 'foo', in: 'whatever', each: 'bar:<foo>'}]},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    builder.declare({
      method:       'get',
      route:        '/test5',
      name:         'test5',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    APIBuilder.stability.stable,
      scopes:       {AllOf: [{for: 'foo', in: 'whatever', each: 'bar:<foo>'}]},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    builder.declare({
      method:       'get',
      route:        '/test6',
      name:         'test6',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    APIBuilder.stability.stable,
      scopes:       {if: 'not_public', then: {AllOf: ['abc', {AnyOf: ['e']}, {for: 'a', in: 'b', each: 'c'}]}},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });

    const api = await builder.build({
      rootUrl:              libUrls.testRootUrl(),
      referenceBucket:      cfg.referenceTestBucket,
      aws:                  cfg.aws,
    });

    await api.publish();

    // Get the file... we don't bother checking the contents this is good
    // enough
    const s3 = new aws.S3(cfg.aws);
    const res = await s3.getObject({
      Bucket:     cfg.referenceTestBucket,
      Key:        'test/v1/api.json',
    }).promise();
    const reference = JSON.parse(res.Body);
    assert(reference.entries, 'Missing entries');
    assert.equal(reference.entries.length, 8);
    assert(reference.title, 'Missing title');
  });
});
