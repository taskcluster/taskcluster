const request         = require('superagent');
const assert          = require('assert');
const APIBuilder      = require('../');
const helper          = require('./helper');
const libUrls         = require('taskcluster-lib-urls');

suite('api/validate', function() {
  const u = path => libUrls.api(helper.rootUrl, 'test', 'v1', path);

  // Create test api
  var builder = new APIBuilder({
    title:        'Test Api',
    description:  'Another test api',
    name:         'test',
    version:      'v1',
  });

  // Declare a method we can test input with
  builder.declare({
    method:   'post',
    route:    '/test-input',
    name:     'testInputValidate',
    input:    'test-schema.json',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send('Hello World');
  });

  // Declare a method we can use to test valid output
  builder.declare({
    method:   'get',
    route:    '/test-output',
    name:     'testInputValidOutputValidate',
    output:   'test-schema.json',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 4});
  });

  // Declare a method we can use to test invalid output
  builder.declare({
    method:   'get',
    route:    '/test-invalid-output',
    name:     'testInputInvalidOutputValidate',
    output:   'test-schema.json',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 12});
  });

  // Declare a method we can test input validation skipping on
  builder.declare({
    method:   'post',
    route:    '/test-skip-input-validation',
    name:     'testInputSkipInputValidation',
    input:    'test-schema.json',
    skipInputValidation: true,
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send('Hello World');
  });

  // Declare a method we can test output validation skipping on
  builder.declare({
    method:   'get',
    route:    '/test-skip-output-validation',
    name:     'testOutputSkipOutputValidation',
    output:    'test-schema.json',
    skipOutputValidation: true,
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 12});
  });

  // Declare a method we can test blob output on
  builder.declare({
    method:   'get',
    route:    '/test-blob-output',
    name:     'testBlobOutput',
    output:   'blob',
    title:    'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 'Hello World'});
  });

  // Create a mock authentication server
  setup(() => helper.setupServer({builder}));
  teardown(helper.teardownServer);

  // Test valid input
  test('input (valid)', function() {
    var url = u('/test-input');
    return request
      .post(url)
      .send({value: 5})
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === 'Hello World', 'Got wrong value');
      });
  });

  // Test invalid input
  test('input (invalid)', function() {
    var url = u('/test-input');
    return request
      .post(url)
      .send({value: 11})
      .then(res => assert(false, 'should have failed!'))
      .catch(function(err) {
        assert(err.status === 400, 'Request wasn\'t rejected');
      });
  });

  // Test valid output
  test('output (valid)', function() {
    var url = u('/test-output');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request okay');
        assert(res.body.value === 4, 'Got wrong value');
      });
  });

  // test invalid output
  test('output (invalid)', function() {
    var url = u('/test-invalid-output');
    return request
      .get(url)
      .then(res => assert(false, 'should have failed!'))
      .catch(function(err) {
        assert(err.status === 500, 'Request wasn\'t 500');
      });
  });

  // test skipping input validation
  test('skip input validation', function() {
    var url = u('/test-skip-input-validation');
    return request
      .post(url)
      .send({value: 100})
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === 'Hello World', 'Got wrong value');
      });
  });

  // test skipping output validation
  test('skip output validation', function() {
    var url = u('/test-skip-output-validation');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.body.value === 12, 'Got wrong value');
      });
  });

  // test blob output
  test('blob output', function() {
    var url = u('/test-blob-output');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.body.value === 'Hello World', 'Got wrong value');
      });
  });

  test('input (correct content-type)', function() {
    var url = u('/test-input');
    return request
      .post(url)
      .send(JSON.stringify({value: 5}))
      .set('content-type', 'application/json')
      .then(function(res) {
        assert(res.status === 200, 'Request rejected');
      });
  });

  test('input (wrong content-type)', function() {
    var url = u('/test-input');
    return request
      .post(url)
      .send(JSON.stringify({value: 5}))
      .set('content-type', 'text/x-json')
      .then(res => assert(false, 'should have failed!'))
      .catch(function(err) {
        assert(err.status === 400, 'Request wasn\'t rejected');
      });
  });
});
