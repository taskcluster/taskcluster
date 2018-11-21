const request         = require('superagent');
const assert          = require('assert');
const APIBuilder      = require('../');
const slugid          = require('slugid');
const helper          = require('./helper');
const libUrls         = require('taskcluster-lib-urls');

suite('api/route', function() {
  const u = path => libUrls.api(helper.rootUrl, 'test', 'v1', path);

  // Create test api
  const builder = new APIBuilder({
    title:        'Test Api',
    description:  'Another test api',
    serviceName:  'test',
    apiVersion:   'v1',
    params: {
      taskId:     /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/,
    },
    context: [
      'expectedValidatedParam',
      'expectedValidatedQuery',
    ],
  });

  builder.declare({
    method:   'get',
    route:    '/single-param/:myparam',
    name:     'testParam',
    title:    'Test End-Point',
    stability:    APIBuilder.stability.stable,
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.params.myparam);
  });

  builder.declare({
    method:   'get',
    route:    '/query-param/',
    query: {
      nextPage: /^[0-9]+$/,
    },
    name:     'testQueryParam',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.query.nextPage || 'empty');
  });

  builder.declare({
    method:   'get',
    route:    '/query-param-fn/',
    query: {
      incantation: function(val) {
        if (val !== this.expectedValidatedQuery) {
          return 'uhoh: query not valid';
        }
      },
    },
    name:     'testQueryParamFn',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.query.incantation);
  });

  builder.declare({
    method:   'get',
    route:    '/slash-param/:name(*)',
    name:     'testSlashParam',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.params.name);
  });

  builder.declare({
    method:   'get',
    route:    '/validated-param/:taskId',
    name:     'testParamValidation',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.params.taskId);
  });

  builder.declare({
    method:   'get',
    route:    '/function-validated-param/:fnValidated',
    name:     'testFunctionParamValidation',
    title:    'Test End-Point',
    params: {
      fnValidated: function(val) {
        if (val !== this.expectedValidatedParam) {
          return 'uhoh: param not valid';
        }
      },
    },
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).send(req.params.fnValidated);
  });

  builder.declare({
    method:   'get',
    route:    '/validated-param-2/:param2',
    name:     'testParam2Validation',
    title:    'Test End-Point',
    description:  'Place we can call to test something',
    params: {
      param2: function(value) {
        if (value !== 'correct') {
          return 'Wrong value passed!';
        }
      },
    },
  }, function(req, res) {
    res.status(200).send(req.params.param2);
  });

  // Create a mock authentication server
  setup(async () => {
    await helper.setupServer({
      builder,
      context: {
        expectedValidatedParam: 'open-sesame',
        expectedValidatedQuery: 'abracadabra',
      },
    });
  });
  teardown(helper.teardownServer);

  test('single parameter', function() {
    const url = u('/single-param/Hello');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === 'Hello', 'Got wrong value');
      });
  });

  test('query parameter', function() {
    const url = u('/query-param/');
    return request
      .get(url)
      .query({nextPage: '352'})
      .catch(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === '352', 'Got wrong value');
      });
  });

  test('query parameter (is optional)', function() {
    const url = u('/query-param/');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === 'empty', 'Got wrong value');
      });
  });

  test('query parameter (validation works)', function() {
    const url = u('/query-param/');
    return request
      .get(url)
      .query({nextPage: 'abc'})
      .then(res => assert(false, 'should have failed!'))
      .catch(function(res) {
        assert(!res.ok, 'Expected request failure!');
        assert(res.status === 400, 'Expected a 400 error');
      });
  });

  test('query parameter with function + context (valid)', function() {
    const url = u('/query-param-fn/');
    return request
      .get(url)
      .query({incantation: 'abracadabra'})
      .then(res => {
        assert(res.ok, 'Request failed');
        assert(res.text === 'abracadabra');
      });
  });

  test('query parameter with function + context (invalid)', function() {
    const url = u('/query-param-fn/');
    return request
      .get(url)
      .query({incantation: 'alohomora'})
      .then(res => assert(false, 'should have failed!'))
      .catch(function(res) {
        assert(!res.ok, 'Expected request failure!');
        assert(res.status === 400, 'Expected a 400 error');
      });
  });

  test('slash parameter', function() {
    const url = u('/slash-param/Hello/World');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === 'Hello/World', 'Got wrong value');
      });
  });

  test('validated reg-exp parameter (valid)', function() {
    const id = slugid.v4();
    const url = u('/validated-param/') + id;
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === id, 'Got wrong value');
      });
  });

  test('validated reg-exp parameter (invalid)', function() {
    const url = u('/validated-param/-');
    return request
      .get(url)
      .then(res => assert(false, 'should have failed!'))
      .catch(function(res) {
        assert(!res.ok, 'Expected a failure');
        assert(res.status === 400, 'Expected a 400 error');
      });
  });

  test('validated function parameter (valid)', function() {
    const url = u('/validated-param-2/correct');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.text === 'correct', 'Got wrong value');
      });
  });

  test('validated function parameter (invalid)', function() {
    const url = u('/validated-param-2/incorrect');
    return request
      .get(url)
      .then(res => assert(false, 'should have failed!'))
      .catch(function(res) {
        assert(!res.ok, 'Expected a failure');
        assert(res.status === 400, 'Expected a 400 error');
      });
  });

  test('validated function parameter using context (valid)', function() {
    const url = u('/function-validated-param/open-sesame');
    return request
      .get(url)
      .then(res => {
        assert(res.ok, 'Request failed');
        assert(res.text === 'open-sesame');
      });
  });

  test('validated function parameter using context (invalid)', function() {
    const url = u('/function-validated-param/open-amaranth');
    return request
      .get(url)
      .then(res => assert(false, 'should have failed!'))
      .catch(function(res) {
        assert(!res.ok, 'Expected request failure!');
        assert(res.status === 400, 'Expected a 400 error');
      });
  });

  test('cache header', function() {
    const url = u('/single-param/Hello');
    return request
      .get(url)
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.header['cache-control'] === 'no-store no-cache must-revalidate', 'Got wrong header');
      });
  });

  test('cache header on 404s', function() {
    const url = u('/unknown');
    return request
      .get(url)
      .then(res => assert(false, 'should have failed!'))
      .catch(function(err) {
        assert(err.response.header['cache-control'] === 'no-store no-cache must-revalidate', 'Got wrong header');
      });
  });

  test('reference', async function() {
    const ref = builder.reference();
    ref.entries.forEach(function(entry) {
      if (entry.name == 'testSlashParam') {
        assert(entry.route === '/slash-param/<name>',
          'not parsing route correctly');
        assert(entry.args.length === 1, 'Wrong number of args');
        assert(entry.args[0] === 'name', 'Failed to parse route correctly');
      }
    });
  });

  test('no duplicate route and method', function() {
    builder.declare({
      method:       'get',
      route:        '/test',
      name:         'test',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});

    assert.throws(function() {
      builder.declare({
        method:       'get',
        route:        '/test',
        name:         'testDuplicate',
        title:        'Test',
        description:  'Test',
      }, function(req, res) {});
    }, /Identical route and method/);
  });

});
