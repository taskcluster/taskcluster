const _               = require('lodash');
const request         = require('superagent-hawk')(require('superagent'));
const assert          = require('assert');
const Promise         = require('promise');
const validator       = require('taskcluster-lib-validate');
const makeApp         = require('taskcluster-lib-app');
const APIBuilder      = require('../');
const testing         = require('taskcluster-lib-testing');
const path            = require('path');

suite('api/auth', function() {
  // Reference for test api server
  var _apiServer = null;

  this.timeout(500);

  // Create test api
  var builder = new APIBuilder({
    title:        'Test Api',
    description:  'Another test api',
    name:         'test',
    version:      'v1',
  });

  // Create a mock authentication server
  setup(async () => {
    const rootUrl = 'http://localhost:4321/';
    testing.fakeauth.start({
      'test-client': ['service:magic'],
      admin: ['*'],
      nobody: ['another-irrelevant-scope'],
      param: ['service:myfolder/resource'],
      param2: ['service:myfolder/resource', 'service:myfolder/other-resource'],
    }, {rootUrl});

    // Create API
    const api = await builder.build({
      rootUrl,
      validator: await validator({
        serviceName: 'test',
        rootUrl,
        folder: path.join(__dirname, 'schemas'),
      }),
    });

    // Create application
    _apiServer = await makeApp({
      port:       23526,
      env:        'development',
      forceSSL:   false,
      trustProxy: false,
      apis: [api],
    });
  });

  // Close server
  teardown(async () => {
    testing.fakeauth.stop();
    await _apiServer.terminate();
  });

  const testEndpoint = ({method, route, name, scopes = null, handler, handlerBuilder, tests}) => {
    let sideEffects = {};
    builder.declare({
      method,
      route,
      name,
      title: 'placeholder',
      description: 'placeholder',
      scopes,
    }, handler || handlerBuilder(sideEffects));
    const buildUrl = (params = {}) => {
      const path = route.replace(/:[a-zA-Z][a-zA-Z0-9]+/g, match => {
        const result = params[match.replace(/^:/, '')];
        if (!result) {
          throw new Error('Bad test, must specifiy all route params!');
        }
        return result;
      });
      return `http://localhost:23526/api/test/v1${path}`;
    };
    const buildHawk = id => ({
      id,
      key: 'not-used-by-fakeauth',
      algorithm: 'sha256',
    });
    tests.forEach(({label, id, desiredStatus=200, params, tester}) => {
      const url = buildUrl(params);
      const auth = buildHawk(id);
      test(label, async () => {
        for (let key of Object.keys(sideEffects)) {
          delete sideEffects[key];
        }
        try {
          const res = await tester(auth, url, sideEffects);
          assert.equal(res.status, desiredStatus);
        } catch (err) {
          if ('status' in err) {
            assert.equal(err.status, desiredStatus);
          } else {
            throw err;
          }
        }
      });
    });
  };

  testEndpoint({
    method: 'get',
    route:  '/test-deprecated-satisfies',
    name: 'testDeprecatedSatisfies',
    handler: (req, res) => {
      if (req.satisfies([])) {
        res.status(200).json({ok: true});
      }
    },
    tests: [
      {
        label: 'function that still uses satisfies fails',
        desiredStatus: 500,
        id: 'nobody',
        tester: (auth, url) => request.get(url).hawk(auth),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route:  '/test-static-scope',
    name: 'testStaticScope',
    scopes: {AllOf: ['service:magic']},
    handler: (req, res) => {
      res.status(200).json({ok: true});
    },
    tests: [
      {
        label: 'request with static scope',
        id: 'test-client',
        tester: (auth, url) => request.get(url).hawk(auth),
      },
      {
        label: 'request with static scope - fail no scope',
        desiredStatus: 403,
        id: 'nobody',
        tester: (auth, url) => request.get(url).hawk(auth),
      },
      {
        label: 'request with static scope - fail bad authentication',
        desiredStatus: 401,
        id: 'doesntexist',
        tester: (auth, url) => request.get(url).hawk(auth),
      },
      {
        label: 'static-scope with authorizedScopes',
        id: 'admin',
        tester: (auth, url) => request.get(url).hawk(auth, {
          ext: new Buffer(JSON.stringify({
            authorizedScopes:    ['service:magic'],
          })).toString('base64'),
        }),
      },
      {
        label: 'static-scope with authorizedScopes (star)',
        id: 'admin',
        tester: (auth, url) => request.get(url).hawk(auth, {
          ext: new Buffer(JSON.stringify({
            authorizedScopes:    ['service:ma*'],
          })).toString('base64'),
        }),
      },
      {
        label: 'static-scope with authorizedScopes (too strict)',
        id: 'admin',
        desiredStatus: 403,
        tester: (auth, url) => request.get(url).hawk(auth, {
          ext: new Buffer(JSON.stringify({
            authorizedScopes:    ['some-irrelevant-scope'],
          })).toString('base64'),
        }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/scopes',
    name: 'scopes',
    scopes: {AllOf: ['service:magic']},
    handler: async (req, res) => {
      res.status(200).json({
        scopes: await req.scopes(),
        clientId: await req.clientId(),
        expires: await req.expires(),
      });
    },
    tests: [
      {
        label: 'request scopes from caller',
        id: 'test-client',
        tester: (auth, url) => request.get(url).hawk(auth)
          .then(function(res) {
            assert(res.ok, 'Request failed');
            assert(res.body.scopes.length === 1, 'wrong number of scopes');
            assert(res.body.scopes[0] === 'service:magic', 'failed scopes');
            assert(res.body.clientId == 'test-client', 'bad clientId');
            assert(/\d{4}-\d{2}-\d{2}.*/.test(res.body.expires), 'bad expires');
            return res;
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-scopes',
    name: 'testScopes',
    scopes: {AllOf: ['service:<param>']},
    handler: async (req, res) => {
      await req.authorize({
        param:      'myfolder/resource',
      });
      res.status(200).json('OK');
    },
    tests: [
      {
        label: 'parameterized scopes',
        id: 'param',
        tester: (auth, url) => request.get(url).hawk(auth),
      },
      {
        label: 'can\'t cheat parameterized scopes',
        id: 'nobody',
        desiredStatus: 403,
        tester: (auth, url) => request.get(url).hawk(auth),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-scopes-authorize-twice',
    name: 'testScopesAuthorizeTwice',
    scopes: {AllOf: ['service:<param>']},
    handler: async (req, res) => {
      await req.authorize({
        param:      'myfolder/resource',
      });
      await req.authorize({
        param:      'myfolder/other-resource',
      });
      res.status(200).json('OK');
    },
    tests: [
      {
        label: 'Parameterized scopes, if authorized is called twice',
        id: 'param2',
        tester: (auth, url) => request.get(url).hawk(auth),
      },
      {
        label: 'Parameterized scopes, if authorized is called twice, with bad scope',
        desiredStatus: 403,
        id: 'param',
        tester: (auth, url) => request.get(url).hawk(auth),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/crash-override',
    name: 'crashOverride',
    scopes: {AllOf: ['service:<param>']},
    handler: async (req, res) => {
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
    },
    tests: [
      {
        label: 'override error',
        id: 'nobody',
        desiredStatus: 410,
        tester: (auth, url) => request.get(url).hawk(auth),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-no-auth',
    name: 'testNoAuth',
    handler: async (req, res) => {
      assert.equal(await req.clientId(), 'auth-failed:no-auth');
      res.status(200).json('OK');
    },
    tests: [
      {
        label: 'public unauthenticated endpoint',
        tester: (auth, url) => request.get(url),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-dyn-auth',
    name: 'testDynAuth',
    scopes: {AllOf: [{for: 'scope', in: 'scopes', each: '<scope>'}]},
    handler: async (req, res) => {
      await req.authorize({scopes: req.body.scopes});
      return res.status(200).json('OK');
    },
    tests: [
      {
        label: 'With dynamic authentication',
        id: 'admin',
        tester: (auth, url) => request
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
          .hawk(auth),
      },
      {
        label: 'With dynamic authentication (authorizedScopes)',
        id: 'admin',
        tester: (auth, url) => request
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
          .hawk(auth, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-all/*', 'got-only/this'],
            })).toString('base64'),
          }),
      },
      {
        label: 'With dynamic authentication (miss scoped)',
        desiredStatus: 403,
        id: 'admin',
        tester: (auth, url) => request
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
          .hawk(auth, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-all/*', 'got-only/this'],
            })).toString('base64'),
          }),
      },
      {
        label: 'With dynamic authentication (miss scoped again)',
        desiredStatus: 403,
        id: 'admin',
        tester: (auth, url) => request
          .get(url)
          .send({
            scopes: [
              'got-only/this*',
            ],
          })
          .hawk(auth, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-only/this'],
            })).toString('base64'),
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-expression-auth/:provisionerId/:workerType',
    name: 'testExpAuthWorker',
    scopes: {AllOf: [
      'queue:create-task:<provisionerId>/<workerType>',
      {for: 'route', in: 'routes', each: 'queue:route:<route>'},
      {for: 'scope', in: 'scopes', each: '<scope>'},
    ]},
    handler: async (req, res) => {
      await req.authorize({
        provisionerId:    req.params.provisionerId,
        workerType:       req.params.workerType,
        scopes:           req.body.scopes,
        routes:           req.body.routes,
      });
      return res.status(200).json('OK');
    },
    tests: [
      {
        label: 'extra scope expresesions',
        id: 'admin',
        params: {provisionerId: 'test-provisioner', workerType: 'test-worker'},
        tester: (auth, url) => request
          .get(url)
          .send({
            routes: ['routeA', 'routeB'],
            scopes: ['scope1', 'scope2'],
          })
          .hawk(auth),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-expression-if-then-2',
    name: 'testIfThen',
    scopes: {if: 'private', then: {AllOf: [
      'some:scope:nobody:has',
    ]}},
    handler: async (req, res) => {
      await req.authorize({
        private: !req.body.public,
      });
      return res.status(200).json('OK');
    },
    tests: [
      {
        label: 'scope expression if/then (success)',
        id: 'admin',
        tester: (auth, url) => request
          .get(url)
          .send({
            public: true,
          })
          .hawk(auth, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['nothing:useful'],
            })).toString('base64'),
          }),
      },
      {
        label: 'scope expression if/then (success with no client)',
        tester: (auth, url) => request
          .get(url)
          .send({
            public: true,
          }),
      },
      {
        label: 'scope expression if/then (failure)',
        desiredStatus: 403,
        id: 'admin',
        tester: (auth, url) => request
          .get(url)
          .send({
            public: false,
          })
          .hawk(auth, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['nothing:useful'],
            })).toString('base64'),
          }),
      },
      {
        label: 'scope expression if/then (failure with no client)',
        desiredStatus: 403,
        tester: (auth, url) => request
          .get(url)
          .send({
            public: false,
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-expression-if-then-forget',
    name: 'testIfThenForget',
    scopes: {AnyOf: [
      'some:scope:nobody:has',
      {if: 'public', then: {AllOf: []}},
    ]},
    handler: async (req, res) => {
      return res.reply({});
    },
    tests: [
      {
        label: 'forgot to auth',
        desiredStatus: 500,
        id: 'admin',
        tester: (auth, url) => request
          .get(url)
          .send({})
          .hawk(auth),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-dyn-auth-no-authorize',
    name: 'testDynNoAuth',
    scopes: {AllOf: [{for: 'scope', in: 'scopes', each: '<scope>'}]},
    handler: async (req, res) => {
      return res.reply({});
    },
    tests: [
      {
        label: 'forgot to auth dyn-auth',
        desiredStatus: 500,
        id: 'admin',
        tester: (auth, url) => request
          .get(url)
          .send({
            scopes: [
              'got-only/this*',
            ],
          })
          .hawk(auth, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-only/this'],
            })).toString('base64'),
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-dyn-auth-missing-authorize',
    name: 'testDynMissingAuth',
    scopes: {AllOf: [{for: 'scope', in: 'scopes', each: '<scope>'}]},
    handler: async (req, res) => {
      await req.authorize({foo: 'bar'});
      return res.reply({});
    },
    tests: [
      {
        label: 'forgot to auth dyn-auth',
        id: 'admin',
        desiredStatus: 500,
        tester: (auth, url) => request
          .get(url)
          .send({
            scopes: [
              'got-only/this*',
            ],
          })
          .hawk(auth, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-only/this'],
            })).toString('base64'),
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-bad-auth-side-effects',
    name: 'testBadAuth',
    scopes: 'something<foo>',
    handlerBuilder: sideEffects => async (req, res) => {
      await req.authorize({foo: 'bar'});
      sideEffects['got-here'] = true;
      return res.reply({});
    },
    tests: [
      {
        label: 'side effects on too-few scopes',
        id: 'nobody',
        desiredStatus: 403,
        tester: async (auth, url, sideEffects) => {
          try {
            await request.get(url).hawk(auth);
            assert(false, 'should have failed');
          } catch (err) {
            assert(!sideEffects['got-here'], 'side effect occured after failed authorization!');
            return err;
          }
        },
      },
      {
        label: 'side effects on failed authentication',
        id: 'does-not-exist',
        desiredStatus: 401,
        tester: async (auth, url, sideEffects) => {
          try {
            await request.get(url).hawk(auth);
            assert(false, 'should have failed');
          } catch (err) {
            assert(!sideEffects['got-here'], 'side effect occured after failed authorization!');
            return err;
          }
        },
      },
    ],
  });
});
