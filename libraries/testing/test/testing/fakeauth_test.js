var _            = require('lodash');
var nock         = require('nock');
var hawk         = require('hawk');
var request      = require('superagent-promise');
var base         = require('taskcluster-base');
var assert       = require('assert');
var taskcluster  = require('taskcluster-client');

var testApi = new base.API({
  title:        "Test Server",
  description:  "for testing"
});

testApi.declare({
  method:       'get',
  route:        '/test',
  name:         'test',
  scopes:       [[]],
  deferAuth:    true,
  title:        "Test function",
  description:  "for testing"
}, function(req, res) {
  return res.status(200).json({
    hasTestScope: req.satisfies([['test.scope']], true)
  });
});


suite('fakeauth', function() {
  var fakeauth = require('../../src/fakeauth');
  var server;

  suiteSetup(function() {
    return base.validator().then(function(validator) {
      // Create application
      var app = base.app({
        port:           1208,
        env:            'development',
        forceSSL:       false,
        trustProxy:     false,
      });
  
      // Create router for the API
      var router =  testApi.router({
        validator:          validator,
      });
  
      // Mount router
      app.use('/v1', router);
  
      // Create server
      return app.createServer().then(function(svr) {
        server = svr;
        // Time out connections after 500 ms, prevents tests from hanging
        svr.setTimeout(500);
        return svr;
      });
    });
  });
  
  suiteTeardown(function() {
    return server.terminate();
  });

  teardown(function() {
    fakeauth.stop();
  });

  var callApi = function(clientId, extContent) {
    var reqUrl = 'http://localhost:1208/v1/test';
    var headerContent = {
      credentials: {
        id:         clientId,
        key:        'unused',
        algorithm:  'sha256',
      }
    };
    if (extContent) {
      headerContent['ext'] = new Buffer(JSON.stringify(extContent)).toString('base64')
    }

    var header = hawk.client.header(reqUrl, 'GET', headerContent);
    return request
      .get(reqUrl)
      .set('Authorization', header.field)
      .end().then(function(res) {
        console.log(res.body);
        return res;
      });
  };

  test('using a rawClientId', function() {
    fakeauth.start({'client1': ['test.scope']});
    return callApi('client1').then(function(res) {
      assert(res.ok && res.body.hasTestScope, "Request failed");
    });
  });

  test('using authorizedScopes', function() {
    fakeauth.start({'client1': ['some.other.scope']});
    return callApi('client1', {
        authorizedScopes: ['test.scope'],
      }).then(function(res) {
      assert(res.ok && res.body.hasTestScope, "Request failed");
    });
  });

  test('using temp creds', function() {
    fakeauth.start({'client1': ['some.other.scope']});
    var tempCreds = taskcluster.createTemporaryCredentials({
      scopes: ['test.scope'],
      expiry: taskcluster.fromNow("1d"),
      credentials: {
        clientId: 'client1',
        accessToken: 'unused'
      }
    });
    return callApi('client1', {
        certificate: JSON.parse(tempCreds.certificate)
      }).then(function(res) {
      assert(res.ok && res.body.hasTestScope, "Request failed");
    });
  });
});

