var base = require('taskcluster-base');
var Promise = require('promise');
var API = require('taskcluster-lib-api');

var api = new API({
  title: "Test API",
  description: "Test API"
});

api.declare({
  method:       'get',
  route:        '/get-test',
  name:         'get',
  title:        "Test Get",
  scopes:       [['test:get']],
  description:  "Place we can call to test GET"
}, function(req, res) {
  res.status(200).json({ok: true});
});

api.declare({
  method:       'post',
  route:        '/post-test',
  name:         'post',
  scopes:       [['test:post']],
  input:        'http://schemas.taskcluster.net/nothing.json',
  skipInputValidation: true,
  title:        "Test Post",
  description:  "Place we can call to test POST"
}, function(req, res) {
  req.scopes().then(function(scopes) {
    res.status(200).json({
      scopes: scopes,
      body: req.body
    });
  });
});

api.declare({
  method:       'post',
  route:        '/post-param/:param',
  name:         'postParam',
  scopes:       [['test:post']],
  input:        'http://schemas.taskcluster.net/nothing.json',
  skipInputValidation: true,
  title:        "Test Post",
  description:  "Place we can call to test POST"
}, function(req, res) {
  return req.scopes().then(function(scopes) {
    res.status(200).json({
      scopes: scopes,
      body: req.body,
      param: req.params.param
    });
  });
});

api.declare({
  method:       'post',
  route:        '/post-param-query/:param',
  query: {
    option:     /^[0-9]+$/
  },
  name:         'postParamQuery',
  scopes:       [['test:post']],
  input:        'http://schemas.taskcluster.net/nothing.json',
  skipInputValidation: true,
  title:        "Test Post",
  description:  "Place we can call to test POST"
}, function(req, res) {
  return req.scopes().then(function(scopes) {
    res.status(200).json({
      scopes: scopes,
      body: req.body,
      param: req.params.param,
      query: req.query.option
    });
  });
});

api.declare({
  method:       'get',
  route:        '/public',
  name:         'public',
  title:        "Test Public",
  description:  "Place we can call to test public api methods"
}, function(req, res) {
  res.status(200).json({ok: true});
});

api.declare({
  method:       'get',
  route:        '/url-param/:param/list',
  name:         'param',
  scopes:       [['test:param']],
  title:        "Test Params",
  description:  "Place we can call to test url parameters"
}, function(req, res) {
  res.status(200).json({params: req.params});
});

api.declare({
  method:       'get',
  route:        '/url-param2/:param/:param2/list',
  name:         'param2',
  scopes:       [['test:param']],
  title:        "Test Params",
  description:  "Place we can call to test url parameters"
}, function(req, res) {
  res.status(200).json({params: req.params});
});

api.declare({
  method:       'get',
  route:        '/query/test',
  query: {
    option:     /^[0-9]+$/
  },
  name:         'query',
  scopes:       [['test:query']],
  title:        "Test Query string options",
  description:  "Place we can call to test query string"
}, function(req, res) {
  res.status(200).json({query: req.query.option});
});

api.declare({
  method:       'get',
  route:        '/param-query/:param',
  query: {
    option:     /^[0-9]+$/
  },
  name:         'paramQuery',
  scopes:       [['test:query']],
  title:        "Test Query string options",
  description:  "Place we can call to test query string"
}, function(req, res) {
  res.status(200).json({query: req.query.option, param: req.params.param});
});


api.declare({
  method:       'get',
  route:        '/public/query/test',
  query: {
    option:     /^[0-9]+$/
  },
  name:         'publicQuery',
  title:        "Test Query string options",
  description:  "Place we can call to test public query string"
}, function(req, res) {
  res.status(200).json({query: req.query.option});
});

var _mockAuthServer = null;
var _testServer = null;
exports.start = function() {
  return base.testing.createMockAuthServer({
    port:         23243,
    clients: [
      {
        clientId:     'tester',
        accessToken:  'secret',
        scopes:       ['test:*'],
      }, {
        clientId:     'nobody',
        accessToken:  'secret',
        scopes:       [],
      }
    ],
  }).then(function(server) {
    _mockAuthServer = server;
    return base.validator();
  }).then(function(validator) {
    // Create router
    var router = api.router({
      validator: validator,
      authBaseUrl: 'http://localhost:23243/v1'
    });

    // Create application
    var app = base.app({
      port:       23526,
      env:        'development',
      forceSSL:   false,
      trustProxy: false,
    });

    // Use router
    app.use('/v1', router);

    return app.createServer();
  }).then(function(server) {
    _testServer = server;
  });
};

exports.reference = function() {
  return api.reference({
    baseUrl: 'http://localhost:23526/v1'
  });
};

exports.stop = function() {
  return Promise.all([
    _mockAuthServer.terminate(),
    _testServer.terminate()
  ]);
};

if (!module.parent) {
  exports.start();
}
