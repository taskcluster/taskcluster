const request         = require('superagent');
const assert          = require('assert');
const APIBuilder      = require('../');
const helper          = require('./helper');
const _               = require('lodash');
const libUrls         = require('taskcluster-lib-urls');

suite('api/errors', function() {
  // Create test api
  const builder = new APIBuilder({
    title:        'Test Api',
    description:  'Yet another test api',
    errorCodes:   {TooManyFoos: 472},
    serviceName:  'test',
    version:      'v1',
  });

  // Create a mock authentication server
  setup(async () => {
    await helper.setupServer({builder});
  });
  teardown(helper.teardownServer);

  builder.declare({
    method:   'get',
    route:    '/inputerror',
    name:     'InputError',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.reportError('InputError', 'Testing Error', {dee: 'tails'});
  });

  test('InputError response', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/inputerror');
    return request.get(url).then(res => assert(false, 'should have failed!')).catch(res => {
      if (!res.status) {
        throw res;
      }
      assert.equal(res.status, 400);
      const response = JSON.parse(res.response.text);
      assert(response.code === 'InputError');
      assert(/Testing Error\n\n---\n\n/.test(response.message));
      delete response.requestInfo['time'];
      assert(_.isEqual(response.requestInfo, {
        method: 'InputError',
        params: {},
        payload: {},
      }));
    });
  });

  builder.declare({
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
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/toomanyfoos');
    return request.get(url).then(res => assert(false, 'should have failed!')).catch(res => {
      assert(res.status === 472);
      const response = JSON.parse(res.response.text);
      response.message = response.message.replace(response.requestInfo.time, '<nowish>');
      response.requestInfo.time = '<nowish>';
      assert.deepEqual(response, {
        code: 'TooManyFoos',
        message: [
          'You can only have 3 foos.  These foos already exist:',
          '[',
          '  1,',
          '  2,',
          '  3',
          ']',
          '',
          '---',
          '',
          '* method:     toomanyfoos',
          '* errorCode:  TooManyFoos',
          '* statusCode: 472',
          '* time:       <nowish>',
        ].join('\n'),
        requestInfo: {
          method: 'toomanyfoos',
          params: {},
          payload: {foos: [4, 5]},
          time: '<nowish>',
        },
      });
    });
  });

  builder.declare({
    method:   'get',
    route:    '/ISE',
    name:     'ISE',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    throw new Error('uhoh');
  });

  test('ISE response', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/ISE');
    return request.get(url).then(res => assert(false, 'should have failed!')).catch(res => {
      assert(res.status === 500);
      const response = JSON.parse(res.response.text);
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

  builder.declare({
    method:   'post',
    route:    '/inputvalidationerror',
    name:     'InputValidationError',
    title:    'Test End-Point',
    input:    'test-schema.yml',
    description:  'Place we can call to test something',
    cleanPayload: payload => {
      payload.secret = '<HIDDEN>';
      return payload;
    },
  }, function(req, res) {
  });

  test('InputValidationError response', async function() {
    const url = libUrls.api(helper.rootUrl, 'test', 'v1', '/inputvalidationerror');
    return request.post(url).send({invalid: 'yep', secret: 's3kr!t'})
      .then(res => assert(false, 'should have failed!'))
      .catch(res => {
        assert.equal(res.status, 400);
        const response = JSON.parse(res.response.text);
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
