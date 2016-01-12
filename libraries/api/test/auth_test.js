suite("api/auth", function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var testing         = require('taskcluster-lib-testing');
  var mockAuthServer  = require('taskcluster-lib-testing/.test/mockauthserver');
  var makeValidator   = require('schema-validator-publisher');
  var makeApp         = require('taskcluster-lib-app');
  var subject         = require('../');
  var express         = require('express');
  var hawk            = require('hawk');
  var slugid          = require('slugid');
  var crypto          = require('crypto');

  // Reference to mock authentication server
  var _mockAuthServer = null;
  // Reference for test api server
  var _apiServer = null;

  this.timeout(500);

  // Create test api
  var api = new subject({
    title:        "Test Api",
    description:  "Another test api"
  });

  api.declare({
    method:       'get',
    route:        '/test-static-scope',
    name:         'testStaticScopes',
    title:        "Test End-Point",
    scopes:       [['service:magic']],
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(200).json({ok: true});
  });

  api.declare({
    method:       'get',
    route:        '/scopes',
    name:         'getScopes',
    title:        "Test End-Point",
    scopes:       [['service:magic']],
    description:  "Place we can call to test something",
  }, async function(req, res) {
    res.status(200).json({scopes: await req.scopes()});
  });

  // Declare a method we can test parameterized scopes with
  api.declare({
    method:       'get',
    route:        '/test-scopes',
    name:         'testScopes',
    title:        "Test End-Point",
    scopes:       [['service:<param>']],
    deferAuth:    true,
    description:  "Place we can call to test something",
  }, function(req, res) {
    if(req.satisfies({
      param:      'myfolder/resource'
    })) {
      res.status(200).json("OK");
    }
  });

  // Declare a method we can test with no authentication
  api.declare({
    method:       'get',
    route:        '/test-no-auth',
    name:         'testNoAuth',
    title:        "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    res.status(200).json("OK");
  });

  // Declare a method we can test dynamic authorization
  api.declare({
    method:       'get',
    route:        '/test-dyn-auth',
    name:         'testDynAuth',
    title:        "Test End-Point",
    description:  "Place we can call to test something",
  }, function(req, res) {
    if(req.satisfies([req.body.scopes])) {
      return res.status(200).json("OK");
    }
  });

  // Create a mock authentication server
  setup(async () => {
    _mockAuthServer = await testing.createMockAuthServer({
      port:         23243,
      clients: [
        {
          clientId:     'test-client',
          accessToken:  'test-token',
          scopes:       ['service:magic'],
        }, {
          clientId:     'rockstar',
          accessToken:  'groupie',
          scopes:       ['*'],
        }, {
          clientId:     'nobody',
          accessToken:  'test-token',
          scopes:       ['another-irrelevant-scope'],
        }
      ],
    });

    // Create router
    var router = api.router({
      validator:      await makeValidator(),
      authBaseUrl:    'http://localhost:23243/v1'
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
    await Promise.all([
      _apiServer.terminate(),
      new Promise(function(accept) {
        _mockAuthServer.once('close', function() {
          _mockAuthServer = null;
          accept();
        });
        _mockAuthServer.close();
      })
    ]);
  });


  test("request with static scope", function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.ok,               "Request failed");
        assert(res.body.ok === true, "Got result");
      });
  });

  test("request with static scope - wrong token", function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'test-client',
        key:          'wrong-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.status === 401, "Request didn't fail");
      });
  });

  test("request with static scope - fail no scope", function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.status === 403, "Request didn't fail");
      });
  });

  test("static-scope with authorizedScopes", function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['service:magic']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        if(!res.ok) {
          console.log(res.body);
          assert(false, "Request failed");
        }
      });
  });

  test("static-scope with authorizedScopes (star)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['service:ma*']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        if(!res.ok) {
          console.log(res.body);
          assert(false, "Request failed");
        }
      });
  });

  test("static-scope with authorizedScopes (too strict)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['some-irrelevant-scope']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.status === 403, "Request didn't fail as expected");
      });
  });

  test("static-scope with authorizedScopes (it doesn't have)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['service:magic']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.status === 401, "Request didn't fail as expected");
      });
  });

  // Test parameterized scopes
  test("Parameterized scopes", function() {
    var url = 'http://localhost:23526/test-scopes';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        if(!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, "Request failed");
        }
      });
  });

  // Test that we can't cheat parameterized scopes
  test("Can't cheat parameterized scopes", function() {
    var url = 'http://localhost:23526/test-scopes';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.status === 403, "Request didn't fail");
      });
  });

  // Test without authentication
  test("Without authentication", function() {
    var url = 'http://localhost:23526/test-no-auth';
    return request
      .get(url)
      .end()
      .then(function(res) {
        if(!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, "Request failed");
        }
      });
  });

  // Test with dynamic authentication
  test("With dynamic authentication", function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-all/folder/t',
          'got-all/hello/*',
          'got-all/',
          'got-all/*',
          'got-only/this'
        ]
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        if(!res.ok) {
          console.log(JSON.stringify(res.body));
          assert(false, "Request failed");
        }
      });
  });

  test("With dynamic authentication (authorizedScopes)", function() {
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
        ]
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-all/*', 'got-only/this']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.ok, "Request failed");
      });
  });

  test("With dynamic authentication (miss scoped)", function() {
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
          'got-*'
        ]
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-all/*', 'got-only/this']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.status === 403, "Request didn't fail");
      });
  });

  test("With dynamic authentication (miss scoped again)", function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-only/this*',
        ]
      })
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-only/this']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.status === 403, "Request didn't fail");
      });
  });

  test("With dynamic authentication (overscoped)", function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-only/this*',
        ]
      })
      .hawk({
        id:           'nobody',
        key:          'test-token',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['got-only/*']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.status === 401, "Request didn't fail");
      });
  });

  test("static-scope using bewit", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var bewit = hawk.uri.getBewit(url, {
      credentials:    {
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      },
      ttlSec:         60,
      ext:            undefined
    });
    return request
      .get(url + "?bewit=" + bewit)
      .end()
      .then(function(res) {
        assert(res.ok,               "Request failed");
        assert(res.body.ok === true, "Got wrong result");
      });
  });

  test("static-scope using bewit (authorizedScopes)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var bewit = hawk.uri.getBewit(url, {
      credentials:    {
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      },
      ttlSec:         60,
      ext:            new Buffer(JSON.stringify({
        authorizedScopes:    ['service:magic']
      })).toString('base64')
    });
    return request
      .get(url + "?bewit=" + bewit)
      .end()
      .then(function(res) {
        assert(res.ok,               "Request failed");
        assert(res.body.ok === true, "Got wrong result");
      });
  });

  test("static-scope using bewit (authorizedScopes star)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var bewit = hawk.uri.getBewit(url, {
      credentials:    {
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      },
      ttlSec:         60,
      ext:            new Buffer(JSON.stringify({
        authorizedScopes:    ['service:mag*']
      })).toString('base64')
    });
    return request
      .get(url + "?bewit=" + bewit)
      .end()
      .then(function(res) {
        assert(res.ok,               "Request failed");
        assert(res.body.ok === true, "Got wrong result");
      });
  });

  test("static-scope using bewit (authorizedScopes underscoped)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var bewit = hawk.uri.getBewit(url, {
      credentials:    {
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      },
      ttlSec:         60,
      ext:            new Buffer(JSON.stringify({
        authorizedScopes:    []
      })).toString('base64')
    });
    return request
      .get(url + "?bewit=" + bewit)
      .end()
      .then(function(res) {
        assert(res.status === 403, "Request didn't fail!");
      });
  });

  test("static-scope using bewit and header", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var bewit = hawk.uri.getBewit(url, {
      credentials:    {
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      },
      ttlSec:         60,
      ext:            undefined
    });
    return request
      .get(url + "?bewit=" + bewit)
      .hawk({
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        // Two authentication schemes is not allowed... so this should fail!
        assert(res.status === 401, "Request didn't fail!!!");
      });
  });

  test("static-scope using bewit expired", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var bewit = hawk.uri.getBewit(url, {
      credentials:    {
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      },
      ttlSec:         -60 * 30,
      ext:            undefined
    });
    return request
      .get(url + "?bewit=" + bewit)
      .end()
      .then(function(res) {
        // Two authentication schemes is not allowed... so this should fail!
        assert(res.status === 401, "Request didn't fail!!!");
      });
  });

  test("request scopes from caller", function() {
    var url = 'http://localhost:23526/scopes';
    return request
      .get(url)
      .hawk({
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.ok, "Request failed");
        assert(res.body.scopes.length === 1, "wrong number of scopes");
        assert(res.body.scopes[0] === 'service:magic', "failed scopes");
      });
  });

  test("static-scope with temporary credentials (star scope)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);

    var certificate = {
      version:          1,
      scopes:           ['service:mag*'],
      start:            new Date().getTime(),
      expiry:           expiry.getTime(),
      seed:             slugid.v4() + slugid.v4(),
      signature:        null
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
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          certificate:  certificate
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        if(!res.ok) {
          console.log(res.body);
          assert(false, "Request failed");
        }
      });
  });

  test("static-scope with temporary credentials (exact scope)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);

    var certificate = {
      version:          1,
      scopes:           ['service:magic'],
      start:            new Date().getTime(),
      expiry:           expiry.getTime(),
      seed:             slugid.v4() + slugid.v4(),
      signature:        null
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
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          certificate:  certificate
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        if(!res.ok) {
          console.log(res.body);
          assert(false, "Request failed");
        }
      });
  });

  test("static-scope with temporary credentials (overscoped)", function() {
    var url = 'http://localhost:23526/test-static-scope';
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);

    var certificate = {
      version:          1,
      scopes:           ['service:mag*'],
      start:            new Date().getTime(),
      expiry:           expiry.getTime(),
      seed:             slugid.v4() + slugid.v4(),
      signature:        null
    };

    var key = 'test-token';

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
        id:           'test-client',
        key:          tempKey,
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          certificate:  certificate
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(!res.ok, 'Request should have failed');
      });
  });
});
