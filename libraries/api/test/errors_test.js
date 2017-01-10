suite("api/errors", function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var subject         = require('../');
  var helper          = require('./helper');
  var _               = require('lodash');

  // Create test api
  var api = new subject({
    title:        "Test Api",
    description:  "Yet another test api",
  });

  // Create a mock authentication server
  setup(() => helper.setupServer({api}));
  teardown(helper.teardownServer);

  api.declare({
    method:   'get',
    route:    '/inputerror',
    name:     'InputError',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.reportError('InputError', 'Testing Error', {'dee': 'tails'},)
  });

  test("InputError response", async function() {
    let url = 'http://localhost:23525/inputerror';
    let res = await request
      .get(url)
      .end();
    assert(res.statusCode === 400);
    let response = JSON.parse(res.text);
    assert(response.code === 'InputError');
    assert(/Testing Error\n----\n/.test(response.message));
    delete response.requestInfo['time'];
    assert(_.isEqual(response.requestInfo, {
      method: 'InputError',
      params: {},
      payload: {},
    }));
    assert(_.isEqual(response.details, {dee: 'tails'}));
  });

  api.declare({
    method:   'get',
    route:    '/ISE',
    name:     'ISE',
    title:    "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    throw new Error('uhoh');
  });

  test("ISE response", async function() {
    let url = 'http://localhost:23525/ISE';
    let res = await request
      .get(url)
      .end();
    assert(res.statusCode === 500);
    let response = JSON.parse(res.text);
    assert(response.code === 'InternalServerError');
    assert(/^Internal/.test(response.message));
    assert(!/uhoh/.test(response.message)); // error doesn't go to user
    delete response.requestInfo['time'];
    assert(_.isEqual(response.requestInfo, {
      method: 'ISE',
      params: {},
      payload: {},
    }));
  });

  api.declare({
    method:   'post',
    route:    '/inputvalidationerror',
    name:     'InputValidationError',
    title:    "Test End-Point",
    input:    'http://localhost:4321/test-schema.json',
    description:  "Place we can call to test something",
    cleanPayload: payload => {
      payload.secret = '<HIDDEN>';
      return payload;
    },
  }, function(req, res) {
  });

  test("InputValidationError response", async function() {
    let url = 'http://localhost:23525/inputvalidationerror';
    let res = await request
      .post(url)
      .send({'invalid': 'yep', 'secret': 's3kr!t'})
      .end();
    assert(res.statusCode === 400);
    let response = JSON.parse(res.text);
    assert(response.code === 'InputValidationError');
    console.log(response.message);
    assert(/<HIDDEN>/.test(response.message)); // replaced payload appears in message
    assert(!/s3kr!t/.test(response.message)); // secret does not appear in message
    delete response.requestInfo['time'];
    assert(_.isEqual(response.requestInfo, {
      method: 'InputValidationError',
      params: {},
      payload: {'invalid': 'yep', 'secret': '<HIDDEN>'},
    }));
    assert(_.isEqual(response.details, {
      schema: 'http://localhost:4321/test-schema.json',
    }));
  });
});
