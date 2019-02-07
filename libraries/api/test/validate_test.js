const request = require('superagent');
const assert = require('assert');
const APIBuilder = require('../');
const helper = require('./helper');
const libUrls = require('taskcluster-lib-urls');
const path = require('path');
const SchemaSet = require('taskcluster-lib-validate');
const Monitor = require('taskcluster-lib-monitor');

suite('api/validate', function() {
  const u = path => libUrls.api(helper.rootUrl, 'test', 'v1', path);

  // Create test api
  const builder = new APIBuilder({
    title: 'Test Api',
    description: 'Another test api',
    serviceName: 'test',
    apiVersion: 'v1',
  });

  // Declare a method we can test input with
  builder.declare({
    method: 'post',
    route: '/test-input',
    name: 'testInputValidate',
    input: 'test-schema.yml',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send('Hello World');
  });

  // Declare a method we can use to test valid output
  builder.declare({
    method: 'get',
    route: '/test-output',
    name: 'testInputValidOutputValidate',
    output: 'test-schema.yml',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 4});
  });

  // Declare a method we can use to test invalid output
  builder.declare({
    method: 'get',
    route: '/test-invalid-output',
    name: 'testInputInvalidOutputValidate',
    output: 'test-schema.yml',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 12});
  });

  // Declare a method we can test input validation skipping on
  builder.declare({
    method: 'post',
    route: '/test-skip-input-validation',
    name: 'testInputSkipInputValidation',
    input: 'test-schema.yml',
    skipInputValidation: true,
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send('Hello World');
  });

  // Declare a method we can test output validation skipping on
  builder.declare({
    method: 'get',
    route: '/test-skip-output-validation',
    name: 'testOutputSkipOutputValidation',
    output: 'test-schema.yml',
    skipOutputValidation: true,
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 12});
  });

  // Declare a method we can test blob output on
  builder.declare({
    method: 'get',
    route: '/test-blob-output',
    name: 'testBlobOutput',
    output: 'blob',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 'Hello World'});
  });

  // Declare a method we can use to test res.reply with empty body
  builder.declare({
    method: 'get',
    route: '/test-res-reply',
    name: 'testResReplyGet',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.reply();
  });

  builder.declare({
    method: 'post',
    route: '/test-res-reply-post',
    name: 'testResReplyPost',
    output: 'test-schema.yml',
    title: 'Test End-Point',
    description: 'Place we can call to test something',
  }, function(req, res) {
    res.reply();
  });

  // Create a mock authentication server
  let monitor;
  setup(async () => {
    monitor = new Monitor({
      projectName: 'tc-lib-api-test',
      mock: true,
    });
    helper.setupServer({builder, monitor});
  });
  teardown(() => {
    monitor.terminate();
    helper.teardownServer();
  });

  // Test valid input
  test('input (valid)', function() {
    const url = u('/test-input');
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
    const url = u('/test-input');
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
    const url = u('/test-output');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request okay');
        assert(res.body.value === 4, 'Got wrong value');
      });
  });

  // test invalid output
  test('output (invalid)', function() {
    const url = u('/test-invalid-output');
    return request
      .get(url)
      .then(res => assert(false, 'should have failed!'))
      .catch(function(err) {
        assert.equal(err.status, 500);
        // the HTTP error should not contain details
        assert(!err.toString().match(/data.value should be/));
        assert.equal(monitor.events.length, 2);
        assert(monitor.events[0].Fields.message.match(/data.value should be <= 10/));
      });
  });

  // test skipping input validation
  test('skip input validation', function() {
    const url = u('/test-skip-input-validation');
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
    const url = u('/test-skip-output-validation');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.body.value === 12, 'Got wrong value');
      });
  });

  // test blob output
  test('blob output', function() {
    const url = u('/test-blob-output');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.body.value === 'Hello World', 'Got wrong value');
      });
  });

  test('input (correct content-type)', function() {
    const url = u('/test-input');
    return request
      .post(url)
      .send(JSON.stringify({value: 5}))
      .set('content-type', 'application/json')
      .then(function(res) {
        assert(res.status === 200, 'Request rejected');
      });
  });

  test('input (wrong content-type)', function() {
    const url = u('/test-input');
    return request
      .post(url)
      .send(JSON.stringify({value: 5}))
      .set('content-type', 'text/x-json')
      .then(res => assert(false, 'should have failed!'))
      .catch(function(err) {
        assert(err.status === 400, 'Request wasn\'t rejected');
      });
  });

  // Test res.reply with empty body for get request
  test('res reply with empty body get request without output schema', function() {
    const url = u('/test-res-reply');
    return request
      .get(url)
      .then(function(res) {
        assert(res.status === 204, 'Got 204 status code with empty body');
      });
  });

  // Test res.reply with empty body for post request
  test('res reply with empty body post request with output schema', function() {
    const url = u('/test-res-reply-post');
    return request
      .post(url)
      .then(function(res) {
        assert(false, 'Request validation failed');
      }).catch(function(err) {
        assert.equal(err.status, 500);
        // the HTTP error should not contain details
        assert(!err.toString().match(/data should be object/));
        assert.equal(monitor.events.length, 2);
        assert(monitor.events[0].Fields.message.match(/data should be object/));
      });
  });

  test('nonexistent schemas are caught at setup time', async function() {
    const builder = new APIBuilder({
      title: 'Test Api',
      description: 'Another test api',
      serviceName: 'test',
      apiVersion: 'v1',
    });

    builder.declare({
      method: 'post',
      route: '/test-input',
      name: 'testInputValidate',
      input: 'no-such-schema.yml',
      title: 'Test End-Point',
      description: '..',
    }, function(req, res) {});

    const schemaset = new SchemaSet({
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });

    const api = await builder.build({rootUrl: libUrls.testRootUrl(), schemaset});
    try {
      api.router();
    } catch (err) {
      if (!/No schema with id/.test(err)) {
        throw err;
      }
      return;
    }
    assert(0, 'Did not get expected exception');
  });
});
