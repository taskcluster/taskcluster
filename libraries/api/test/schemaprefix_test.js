suite('api/schemaPrefix', function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent');
  var assert          = require('assert');
  var Promise         = require('promise');
  var testing         = require('taskcluster-lib-testing');
  var validator       = require('taskcluster-lib-validate');
  var subject         = require('../');
  var helper          = require('./helper');

  // Create test api
  var api = new subject({
    title:        'Test Api',
    description:  'Another test api',
    schemaPrefix: 'http://localhost:4321/',
    name:         'test',
  });

  // Declare a method we can test input with
  api.declare({
    method:   'get',
    route:    '/test-input',
    name:     'testInput',
    input:    'test-schema.json',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send('Hello World');
  });

  // Declare a method we can use to test valid output
  api.declare({
    method:   'get',
    route:    '/test-output',
    name:     'testInputValidOutput',
    output:   'test-schema.json',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.reply({value: 4});
  });

  // Create a mock authentication server
  setup(() => helper.setupServer({api}));
  teardown(helper.teardownServer);

  // Test valid input
  test('input (valid)', function() {
    var url = 'http://localhost:23525/test-input';
    return request
      .get(url)
      .send({value: 5})
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === 'Hello World', 'Got wrong value');
      });
  });

  // Test invalid input
  test('input (invalid)', function() {
    var url = 'http://localhost:23525/test-input';
    return request
      .get(url)
      .send({value: 11})
      .then(res => assert(false, 'should have failed!'))
      .catch(function(err) {
        assert(err.status === 400, 'Request wasn\'t rejected');
      });
  });

  // Test valid output
  test('output (valid)', function() {
    var url = 'http://localhost:23525/test-output';
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request okay');
        assert(res.body.value === 4, 'Got wrong value');
      });
  });
});
