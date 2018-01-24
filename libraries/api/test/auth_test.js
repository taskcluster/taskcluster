suite('api/auth', function() {
  var request         = require('superagent-hawk')(require('superagent'));
  var assert          = require('assert');
  var Promise         = require('promise');
  var validator       = require('taskcluster-lib-validate');
  var makeApp         = require('taskcluster-lib-app');
  var subject         = require('../');
  var express         = require('express');
  var hawk            = require('hawk');
  var slugid          = require('slugid');
  var crypto          = require('crypto');
  var testing         = require('taskcluster-lib-testing');
  var path            = require('path');

  // Reference for test api server
  var _apiServer = null;

  this.timeout(500);

  // Create test api
  var api = new subject({
    title:        'Test Api',
    description:  'Another test api',
  });

  api.declare({
    method:       'get',
    route:        '/test-deprecated-satisfies',
    name:         'testDepSat',
    title:        'Test End-Point',
    description:  'Place we can call to test something',
  }, function(req, res) {
    if (req.satisfies([])) {
      res.status(200).json({ok: true});
    }
  });

  api.declare({
    method:       'get',
    route:        '/test-static-scope',
    name:         'testStaticScopes',
    title:        'Test End-Point',
    scopes:       {AllOf: ['service:magic']},
    description:  'Place we can call to test something',
  }, function(req, res) {
    res.status(200).json({ok: true});
  });

  api.declare({
    method:       'get',
    route:        '/scopes',
    name:         'getScopes',
    title:        'Test End-Point',
    scopes:       {AllOf: ['service:magic']},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    res.status(200).json({
      scopes: await req.scopes(),
      clientId: await req.clientId(),
      expires: await req.expires(),
    });
  });

  // Declare a method we can test parameterized scopes with
  api.declare({
    method:       'get',
    route:        '/test-scopes',
    name:         'testScopes',
    title:        'Test End-Point',
    scopes:       {AllOf: ['service:<param>']},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    await req.authorize({
      param:      'myfolder/resource',
    });
    res.status(200).json('OK');
  });

  // Declare a method we can test calling authorize twice
  api.declare({
    method:       'get',
    route:        '/test-scopes-authorize-twice',
    name:         'testScopesAuthTwice',
    title:        'Test End-Point',
    scopes:       {AllOf: ['service:<param>']},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    await req.authorize({
      param:      'myfolder/resource',
    });
    await req.authorize({
      param:      'myfolder/other-resource',
    });
    res.status(200).json('OK');
  });

  // Declare a method we can test overriding errors with
  api.declare({
    method:       'get',
    route:        '/crash-override',
    name:         'override',
    title:        'Test End-Point',
    scopes:       {AllOf: ['service:<param>']},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    try {
      await req.authorize({param: 'myfolder/resource'});
      res.reply({});
    } catch (err) {
      if (err.code === 'AuthorizationError') {
        // we probably wouldn't normally throw a resource expired error for
        // missing scopes, but this is a convenient way to assert we have
        // overridden the error
        return res.reportError('ResourceExpired', 'bad things!', {});
      }
      throw err;
    }
  });

  // Declare a method we can test with no authentication
  api.declare({
    method:       'get',
    route:        '/test-no-auth',
    name:         'testNoAuth',
    title:        'Test End-Point',
    description:  'Place we can call to test something',
  }, async function(req, res) {
    assert.equal(await req.clientId(), 'auth-failed:no-auth');
    res.status(200).json('OK');
  });

  // Declare a method we can test dynamic authorization
  api.declare({
    method:       'get',
    route:        '/test-dyn-auth',
    name:         'testDynAuth',
    title:        'Test End-Point',
    scopes:       {AllOf: [{for: 'scope', in: 'request.scopes', each: '<scope>'}]},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    await req.authorize({request: req.body});
    return res.status(200).json('OK');
  });

  // Declare a method we can test with expression authorization again
  api.declare({
    method:       'get',
    route:        '/test-expression-auth/:provisionerId/:workerType',
    name:         'testExprAuth',
    title:        'Test End-Point',
    scopes:       {AllOf: [
      'queue:create-task:<provisionerId>/<workerType>',
      {for: 'route', in: 'task.routes', each: 'queue:route:<route>'},
      {for: 'scope', in: 'task.scopes', each: '<scope>'},
    ]},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    await req.authorize({
      provisionerId:    req.params.provisionerId,
      workerType:       req.params.workerType,
      task:             req.body,
    });
    return res.status(200).json('OK');
  });

  // Declare a couple methods we can test with expression utilizing if/then
  api.declare({
    method:       'get',
    route:        '/test-expression-if-then',
    name:         'testExprAuth',
    title:        'Test End-Point',
    scopes:       {AnyOf: [
      'some:scope:nobody:has',
      {if: 'public', then: {AllOf: []}},
    ]},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    await req.authorize({
      public: req.body.public,
    });
    return res.status(200).json('OK');
  });
  api.declare({
    method:       'get',
    route:        '/test-expression-if-then-2',
    name:         'testExprAuth',
    title:        'Test End-Point',
    scopes:       {if: 'private', then: {AllOf: [
      'some:scope:nobody:has',
    ]}},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    await req.authorize({
      private: !req.body.public,
    });
    return res.status(200).json('OK');
  });

  // Declare a method we can test with expression utilizing if/then but then forget to auth
  api.declare({
    method:       'get',
    route:        '/test-expression-if-then-forget',
    name:         'testExprAuth',
    title:        'Test End-Point',
    scopes:       {AnyOf: [
      'some:scope:nobody:has',
      {if: 'public', then: {AllOf: []}},
    ]},
    description:  'Place we can call to test something',
  }, function(req, res) {
    return res.reply({});
  });

  // Declare a method we can test dynamic authorization but never call authorize
  // This will only work with our res.reply()
  api.declare({
    method:       'get',
    route:        '/test-dyn-auth-no-authorize',
    name:         'testDynAuthNoAuthorize',
    title:        'Test End-Point',
    scopes:       {AllOf: [{for: 'scope', in: 'request.scopes', each: '<scope>'}]},
    description:  'Place we can call to test something',
  }, function(req, res) {
    return res.reply({});
  });

  // Declare a method we can test dynamic authorization but have missing call to auth
  api.declare({
    method:       'get',
    route:        '/test-dyn-auth-missing-authorize',
    name:         'testDynAuthNoAuthorize',
    title:        'Test End-Point',
    scopes:       {AllOf: [{for: 'scope', in: 'request.scopes', each: '<scope>'}]},
    description:  'Place we can call to test something',
  }, async function(req, res) {
    await req.authorize({foo: 'bar'});
    return res.reply({});
  });

  // Create a mock authentication server
  setup(async () => {
    testing.fakeauth.start({
      'test-client': ['service:magic'],
      rockstar:    ['*'],
      nobody:      ['another-irrelevant-scope'],
      param:       ['service:myfolder/resource'],
      param2:      ['service:myfolder/resource', 'service:myfolder/other-resource'],
    });

    // Create router
    var router = api.router({
      validator:      await validator({
        folder:         path.join(__dirname, 'schemas'),
        baseUrl:        'http://localhost:4321/',
      }),
    });

    // Create application
    var app = makeApp({
      port:       23526,
      env:        'development',
      forceSSL:   false,
      trustProxy: false,
    });

    // Use router
    app.use(router);

    _apiServer = await app.createServer();
  });

  // Close server
  teardown(async () => {
    testing.fakeauth.stop();
    await _apiServer.terminate();
  });

  test('function that still uses satisfies fails', function() {
    var url = 'http://localhost:23526/test-deprecated-satisfies';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256',
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 500, 'Request didn\'t fail');
      });
  });

  test('request with static scope', function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256',
      })
      .then(function(res) {
        assert(res.ok,               'Request failed');
        assert(res.body.ok === true, 'Got result');
      });
  });

  test('request with static scope - fail no scope', function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256',
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('override error', function() {
    var url = 'http://localhost:23526/crash-override';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256',
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 410, 'Request didn\'t fail');
      });
  });

  test('static-scope with authorizedScopes', function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['service:magic'],
        })).toString('base64'),
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(res.body);
          assert(false, 'Request failed');
        }
      });
  });

  test('static-scope with authorizedScopes (star)', function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['service:ma*'],
        })).toString('base64'),
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(res.body);
          assert(false, 'Request failed');
        }
      });
  });

  test('static-scope with authorizedScopes (too strict)', function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['some-irrelevant-scope'],
        })).toString('base64'),
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail as expected');
      });
  });

  // Test parameterized scopes
  test('Parameterized scopes', function() {
    var url = 'http://localhost:23526/test-scopes';
    return request
      .get(url)
      .hawk({
        id:           'param',
        key:          '--',
        algorithm:    'sha256',
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  // Test that we can't cheat parameterized scopes
  test('Can\'t cheat parameterized scopes', function() {
    var url = 'http://localhost:23526/test-scopes';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256',
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('Parameterized scopes, if authorized is called twice', function() {
    var url = 'http://localhost:23526/test-scopes-authorize-twice';
    return request
      .get(url)
      .hawk({
        id:           'param2',
        key:          '--',
        algorithm:    'sha256',
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  test('Parameterized scopes, if authorized is called twice, with bad scope', function() {
    var url = 'http://localhost:23526/test-scopes-authorize-twice';
    return request
      .get(url)
      .hawk({
        id:           'param',
        key:          '--',
        algorithm:    'sha256',
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  // Test without authentication
  test('Without authentication', function() {
    var url = 'http://localhost:23526/test-no-auth';
    return request
      .get(url)
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  // Test with dynamic authentication
  test('With dynamic authentication', function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-all/folder/t',
          'got-all/hello/*',
          'got-all/',
          'got-all/*',
          'got-only/this',
        ],
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  test('With dynamic authentication (authorizedScopes)', function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-all/folder/t',
          'got-all/hello/*',
          'got-all/',
          'got-all/*',
          'got-only/this',
        ],
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-all/*', 'got-only/this'],
        })).toString('base64'),
      })
      .then(function(res) {
        assert(res.ok, 'Request failed');
      });
  });

  test('With dynamic authentication (miss scoped)', function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-all/folder/t',
          'got-all/hello/*',
          'got-all/',
          'got-all/*',
          'got-only/this',
          'got-*',
        ],
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-all/*', 'got-only/this'],
        })).toString('base64'),
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('With dynamic authentication (miss scoped again)', function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-only/this*',
        ],
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-only/this'],
        })).toString('base64'),
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('extra scope expresesions', function() {
    var url = 'http://localhost:23526/test-expression-auth/test-provisioner/test-worker';
    return request
      .get(url)
      .send({
        routes: ['routeA', 'routeB'],
        scopes: ['scope1', 'scope2'],
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  test('scope expression if/then (success)', function() {
    var url = 'http://localhost:23526/test-expression-if-then';
    return request
      .get(url)
      .send({
        public: true,
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['nothing:useful'],
        })).toString('base64'),
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  test('scope expression if/then (success with no client)', function() {
    var url = 'http://localhost:23526/test-expression-if-then';
    return request
      .get(url)
      .send({
        public: true,
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  test('scope expression if/then (failure)', function() {
    var url = 'http://localhost:23526/test-expression-if-then';
    return request
      .get(url)
      .send({
        public: false,
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['nothing:useful'],
        })).toString('base64'),
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('scope expression if/then (failure with no client)', function() {
    var url = 'http://localhost:23526/test-expression-if-then';
    return request
      .get(url)
      .send({
        public: false,
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('scope expression if/then (success) 2', function() {
    var url = 'http://localhost:23526/test-expression-if-then-2';
    return request
      .get(url)
      .send({
        public: true,
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['nothing:useful'],
        })).toString('base64'),
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  test('scope expression if/then (success with no client) 2', function() {
    var url = 'http://localhost:23526/test-expression-if-then-2';
    return request
      .get(url)
      .send({
        public: true,
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, 'Request failed');
        }
      });
  });

  test('scope expression if/then (failure) 2', function() {
    var url = 'http://localhost:23526/test-expression-if-then-2';
    return request
      .get(url)
      .send({
        public: false,
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['nothing:useful'],
        })).toString('base64'),
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('scope expression if/then (failure with no client) 2', function() {
    var url = 'http://localhost:23526/test-expression-if-then-2';
    return request
      .get(url)
      .send({
        public: false,
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 403, 'Request didn\'t fail');
      });
  });

  test('scope expression if/then (forgot to auth)', function() {
    var url = 'http://localhost:23526/test-expression-if-then-forget';
    return request
      .get(url)
      .send({})
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 500, 'Request didn\'t fail');
      });
  });

  test('dyn auth but no call to authorize', function() {
    var url = 'http://localhost:23526/test-dyn-auth-no-authorize';
    return request
      .get(url)
      .send({
        scopes: [
          'got-only/this*',
        ],
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-only/this'],
        })).toString('base64'),
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 500, 'Request didn\'t fail');
      });
  });

  test('dyn auth but missing authorize', function() {
    var url = 'http://localhost:23526/test-dyn-auth-missing-authorize';
    return request
      .get(url)
      .send({
        scopes: [
          'got-only/this*',
        ],
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-only/this'],
        })).toString('base64'),
      })
      .then(res => assert(false, 'request didn\'t fail'))
      .catch(function(res) {
        assert(res.status === 500, 'Request didn\'t fail');
      });
  });

  test('request scopes from caller', function() {
    var url = 'http://localhost:23526/scopes';
    return request
      .get(url)
      .hawk({
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256',
      })
      .then(function(res) {
        assert(res.ok, 'Request failed');
        assert(res.body.scopes.length === 1, 'wrong number of scopes');
        assert(res.body.scopes[0] === 'service:magic', 'failed scopes');
        assert(res.body.clientId == 'test-client', 'bad clientId');
        assert(/\d{4}-\d{2}-\d{2}.*/.test(res.body.expires), 'bad expires');
      });
  });

  test('static-scope with temporary credentials (star scope)', function() {
    var url = 'http://localhost:23526/test-static-scope';
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);

    var certificate = {
      version:          1,
      scopes:           ['service:mag*'],
      start:            new Date().getTime(),
      expiry:           expiry.getTime(),
      seed:             slugid.v4() + slugid.v4(),
      signature:        null,
    };

    var key = 'groupie';

    // Create signature
    var signature = crypto.createHmac('sha256', key)
      .update(
        [
          'version:'  + certificate.version,
          'seed:'     + certificate.seed,
          'start:'    + certificate.start,
          'expiry:'   + certificate.expiry,
          'scopes:',
        ].concat(certificate.scopes).join('\n')
      )
      .digest('base64');
    certificate.signature = signature;

    // Create temporary key
    var tempKey = crypto.createHmac('sha256', key)
      .update(certificate.seed)
      .digest('base64')
      .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
      .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
      .replace(/=/g,  '');  // Drop '==' padding

    // Send request
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          tempKey,
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          certificate:  certificate,
        })).toString('base64'),
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(res.body);
          assert(false, 'Request failed');
        }
      });
  });

  test('static-scope with temporary credentials (exact scope)', function() {
    var url = 'http://localhost:23526/test-static-scope';
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);

    var certificate = {
      version:          1,
      scopes:           ['service:magic'],
      start:            new Date().getTime(),
      expiry:           expiry.getTime(),
      seed:             slugid.v4() + slugid.v4(),
      signature:        null,
    };

    var key = 'groupie';

    // Create signature
    var signature = crypto.createHmac('sha256', key)
      .update(
        [
          'version:'  + certificate.version,
          'seed:'     + certificate.seed,
          'start:'    + certificate.start,
          'expiry:'   + certificate.expiry,
          'scopes:',
        ].concat(certificate.scopes).join('\n')
      )
      .digest('base64');
    certificate.signature = signature;

    // Create temporary key
    var tempKey = crypto.createHmac('sha256', key)
      .update(certificate.seed)
      .digest('base64')
      .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
      .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
      .replace(/=/g,  '');  // Drop '==' padding

    // Send request
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          tempKey,
        algorithm:    'sha256',
      }, {
        ext: new Buffer(JSON.stringify({
          certificate:  certificate,
        })).toString('base64'),
      })
      .then(function(res) {
        if (!res.ok) {
          console.log(res.body);
          assert(false, 'Request failed');
        }
      });
  });
});
