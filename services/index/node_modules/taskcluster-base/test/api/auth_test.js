suite("api/auth", function() {
  require('superagent-hawk')(require('superagent'));
  var request         = require('superagent-promise');
  var assert          = require('assert');
  var Promise         = require('promise');
  var mockAuthServer  = require('../mockauthserver');
  var base            = require('../../');
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
  var api = new base.API({
    title:        "Test Api",
    description:  "Another test api"
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
  setup(function(){
    assert(_mockAuthServer === null,  "_mockAuthServer must be null");
    assert(_apiServer === null,       "_apiServer must be null");
    return mockAuthServer({
      port:         23243
    }).then(function(server) {
      _mockAuthServer = server;
    }).then(function() {
      // Create server for api
      return base.validator().then(function(validator) {
        // Create router
        var router = api.router({
          validator:      validator,
          credentials: {
            clientId:     'test-client',
            accessToken:  'test-token'
          },
          authBaseUrl:    'http://localhost:23243'
        });

        // Create application
        app = express();

        // Use router
        app.use(router);

        return new Promise(function(accept, reject) {
          var server = app.listen(23526);
          server.once('listening', function() {
            accept(server)
          });
          server.once('error', reject);
          _apiServer = server;
        });
      });
    });
  });

  // Close server
  teardown(function() {
    assert(_mockAuthServer, "_mockAuthServer doesn't exist");
    assert(_apiServer,      "_apiServer doesn't exist");
    return new Promise(function(accept) {
      _apiServer.once('close', function() {
        _apiServer = null;
        accept();
      });
      _apiServer.close();
    }).then(function() {
      return new Promise(function(accept) {
        _mockAuthServer.once('close', function() {
          _mockAuthServer = null;
          accept();
        });
        _mockAuthServer.close();
      });
    });
  });


  // Test getCredentials from mockAuthServer
  test("getCredentials from mockAuthServer", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
    return request
      .get(url)
      .hawk({
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.ok,                                "Request failed");
        assert(res.body.accessToken === 'test-token', "Got wrong token");
      });
  });

  // Test getCredentials with wrong credentials
  test("Fail auth", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
    return request
      .get(url)
      .hawk({
        id:           'delegating-client',
        key:          'test-token',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.status === 401, "Request didn't failed");
      });
  });


  test("Auth with restricted scopes", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
    return request
      .get(url)
      .hawk({
        id:           'rockstar',
        key:          'groupie',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['auth:credenti*']
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

  test("Auth with restricted scopes (too restricted)", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
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
        assert(res.status === 401, "Request didn't fail as expected");
      });
  });

  test("Auth with restricted scopes (can't restrict)", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
    return request
      .get(url)
      .hawk({
        id:           'nobody',
        key:          'nerd',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          authorizedScopes:    ['auth:credenti*']
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
        key:          'nerd',
        algorithm:    'sha256'
      })
      .end()
      .then(function(res) {
        assert(res.status === 401, "Request didn't failed");
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

  // Test with dynamic authentication that doesn't work
  test("With dynamic authentication (overscoped)", function() {
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
        id:           'delegating-client',
        key:          'test-token',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          delegating:       true,
          scopes:           ['got-all/*', 'got-only/this']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.status === 401, "Request didn't failed");
      });
  });

  // Test with dynamic authentication that doesn't work (again)
  test("With dynamic authentication (overscoped again)", function() {
    var url = 'http://localhost:23526/test-dyn-auth';
    return request
      .get(url)
      .send({
        scopes: [
          'got-only/this*',
        ]
      })
      .hawk({
        id:           'delegating-client',
        key:          'test-token',
        algorithm:    'sha256'
      }, {
        ext: new Buffer(JSON.stringify({
          delegating:       true,
          scopes:           ['got-only/this']
        })).toString('base64')
      })
      .end()
      .then(function(res) {
        assert(res.status === 401, "Request didn't failed");
      });
  });

  test("getCredentials using bewit", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
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
        assert(res.ok,                                "Request failed");
        assert(res.body.accessToken === 'test-token', "Got wrong token");
      });
  });

  test("getCredentials using bewit (authorizedScopes)", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
    var bewit = hawk.uri.getBewit(url, {
      credentials:    {
        id:           'test-client',
        key:          'test-token',
        algorithm:    'sha256'
      },
      ttlSec:         60,
      ext:            new Buffer(JSON.stringify({
        authorizedScopes:    ['auth:credentials']
      })).toString('base64')
    });
    return request
      .get(url + "?bewit=" + bewit)
      .end()
      .then(function(res) {
        assert(res.ok,                                "Request failed");
        assert(res.body.accessToken === 'test-token', "Got wrong token");
      });
  });


  test("getCredentials using bewit (authorizedScopes underscoped)", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
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
        assert(res.status === 401, "Request didn't fail!");
      });
  });


  test("getCredentials using bewit and header", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
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

  test("getCredentials using bewit expired", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
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



  test("Auth with temporary credentials", function() {
    var url = 'http://localhost:23243/client/test-client/credentials';
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);

    var certificate = {
      version:          1,
      scopes:           ['auth:credenti*'],
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
});
