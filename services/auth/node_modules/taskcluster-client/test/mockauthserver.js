var base    = require('taskcluster-base');
var _       = require('lodash');
var Promise = require('promise');
var debug   = require('debug')('taskcluster-client:test:mockAuthServer');

// Clients hardcoded into this server
var _clients = {
  'test-client': {
      clientId:     'test-client',
      accessToken:  'test-token',
      scopes:       ['auth:credentials'],
      expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
  },
  'delegating-client': {
      clientId:     'delegating-client',
      accessToken:  'test-token',
      scopes:       ['auth:can-delegate'],
      expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
  }
};

/** Create mock authentication API */
var api = new base.API({
  title:        "Authentication Mock Server",
  description: [
    "Server that simulates an instance of the taskcluster\n" +
    "authentication server"
  ].join('\n')
});

/** Create interface for returning a response */
api.declare({
  method:       'get',
  route:        '/client/:clientId/credentials',
  name:         'getCredentials',
  scopes:       ['auth:credentials'],
  title:        "Get Credentials",
  description:  "Get credentials... mock..."
}, function(req, res) {
  var client = _clients[req.params.clientId];
  if (client) {
    res.json(200, client);
  } else {
    res.json(404, {error: "ClientId not found"});
  }
});

/** Load client from hardcoded set of client */
var clientLoader = function(clientId) {
  return new Promise(function(accept, reject) {
    var client = _clients[clientId];
    if (client) {
      return accept(new base.API.authenticate.Client(client));
    }
    return reject();
  });
};

/**
 * Create a server listening to a given port
 *
 * options:
 * {
 *   port:      62351  // Port to listen on
 * }
 *
 * Return a promise for an instance of `http.Server`.
 */
var mockAuthServer = function(options) {
  // Set default options
  options = _.defaults(options || {}, {
    port:       62351
  });

  // Create validator
  return base.validator({
    publish:  false
  }).then(function(validator) {
    // Create express application
    var app = base.app(options);

    // Create API router
    var router = api.router({
      validator:      validator,
      clientLoader:   clientLoader
    });
    // Mount router
    app.use(router);

    return app.createServer();
  });
};

// Export mockAuthServer
module.exports = mockAuthServer;

// Export API declaration
mockAuthServer.api = api;
