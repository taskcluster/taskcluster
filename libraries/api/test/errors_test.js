suite('api/errors', function() {
  var request         = require('superagent');
  var assert          = require('assert');
  var Promise         = require('promise');
  var subject         = require('../');
  var helper          = require('./helper');
  var _               = require('lodash');

  // Create test api
  var api = new subject({
    title:        'Test Api',
    description:  'Yet another test api',
    errorCodes: {TooManyFoos: 472},
  });

  // Create a mock authentication server
  setup(() => helper.setupServer({api}));
  teardown(helper.teardownServer);

  api.declare({
    method:   'get',
    route:    '/inputerror',
    name:     'InputError',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.reportError('InputError', 'Testing Error', {dee: 'tails'});
  });

  test('InputError response', async function() {
    let url = 'http://localhost:23525/inputerror';
    return request.get(url).then(res => assert(false, 'should have failed!')).catch(res => {
      assert(res.status === 400);
      let response = JSON.parse(res.response.text);
      assert(response.code === 'InputError');
      assert(/Testing Error\n----\n/.test(response.message));
      delete response.requestInfo['time'];
      assert(_.isEqual(response.requestInfo, {
        method: 'InputError',
        params: {},
        payload: {},
      }));
    });
  });

  api.declare({
    method:   'get',
    route:    '/toomanyfoos',
    name:     'toomanyfoos',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    req.body.foos = [4, 5];
    res.reportError(
      'TooManyFoos',
      'You can only have 3 foos.  These foos already exist:\n{{foos}}',
      {foos: [1, 2, 3]});
  });

  test('TooManyFoos response', async function() {
    let url = 'http://localhost:23525/toomanyfoos';
    return request.get(url).then(res => assert(false, 'should have failed!')).catch(res => {
      assert(res.status === 472);
      let response = JSON.parse(res.response.text);
      response.message = response.message.replace(response.requestInfo.time, '<nowish>');
      response.requestInfo.time = '<nowish>';
      assert(_.isEqual(response, {
        code: 'TooManyFoos',
        message: [
          'You can only have 3 foos.  These foos already exist:',
          '[',
          '  1,',
          '  2,',
          '  3',
          ']',
          '----',
          'method:     toomanyfoos',
          'errorCode:  TooManyFoos',
          'statusCode: 472',
          'time:       <nowish>',
        ].join('\n'),
        requestInfo: {
          method: 'toomanyfoos',
          params: {},
          payload: {foos: [4, 5]},
          time: '<nowish>',
        },
      }));
    });
  });

  api.declare({
    method:   'get',
    route:    '/ISE',
    name:     'ISE',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    throw new Error('uhoh');
  });

  test('ISE response', async function() {
    let url = 'http://localhost:23525/ISE';
    return request.get(url).then(res => assert(false, 'should have failed!')).catch(res => {
      assert(res.status === 500);
      let response = JSON.parse(res.response.text);
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
  });

  api.declare({
    method:   'post',
    route:    '/inputvalidationerror',
    name:     'InputValidationError',
    title:    'Test End-Point',
    input:    'http://localhost:4321/test-schema.json',
    description:  'Place we can call to test something',
    cleanPayload: payload => {
      payload.secret = '<HIDDEN>';
      return payload;
    },
  }, function(req, res) {
  });

  test('InputValidationError response', async function() {
    let url = 'http://localhost:23525/inputvalidationerror';
    return request.post(url).send({invalid: 'yep', secret: 's3kr!t'})
      .then(res => assert(false, 'should have failed!'))
      .catch(res => {
        assert(res.status === 400);
        let response = JSON.parse(res.response.text);
        assert(!/s3kr!t/.test(res.text)); // secret does not appear in response
        assert(response.code === 'InputValidationError');
        assert(response.requestInfo.payload.secret == '<HIDDEN>'); // replaced payload appears in response
        delete response.requestInfo['time'];
        assert(_.isEqual(response.requestInfo, {
          method: 'InputValidationError',
          params: {},
          payload: {invalid: 'yep', secret: '<HIDDEN>'},
        }));
      });
  });
});
