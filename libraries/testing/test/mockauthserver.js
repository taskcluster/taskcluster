let express = require('express');
let API = require('taskcluster-lib-api');
let _ = require('lodash');
let Promise = require('promise');
let debug = require('debug')('base:test:authserver_mock');

// Clients hardcoded into this server
let _clients = {
  'test-client': {
    clientId: 'test-client',
    accessToken: 'test-token',
    scopes: ['auth:credentials'],
    expires: new Date(2092, 0, 0, 0, 0, 0, 0),
  },
  'delegating-client': {
    clientId: 'delegating-client',
    accessToken: 'test-token',
    scopes: ['auth:can-delegate'],
    expires: new Date(2092, 0, 0, 0, 0, 0, 0),
  },
  rockstar: {
    clientId: 'rockstar',
    accessToken: 'groupie',
    scopes: ['*'],
    expires: new Date(2092, 0, 0, 0, 0, 0, 0),
  },
  nobody: {
    clientId: 'nobody',
    accessToken: 'nerd',
    scopes: ['another-irrelevant-scope'],
    expires: new Date(2092, 0, 0, 0, 0, 0, 0),
  },
};

/** Create mock authentication API */
let api = new API({
  title: 'Authentication Mock Server',
  description: [
    'Server that simulates an instance of the taskcluster\n' +
    'authentication server',
  ].join('\n'),
});

/** Create interface for returning a response */
api.declare({
  method: 'get',
  route: '/client/:clientId/credentials',
  name: 'getCredentials',
  scopes: [['auth:credentials']],
  title: 'Get Credentials',
  description: 'Get credentials... mock...',
}, function(req, res) {
  let client = _clients[req.params.clientId];
  if (client) {
    res.status(200).json(client);
  } else {
    res.status(404).json({error: 'ClientId not found'});
  }
});

/** Load client from hardcoded set of client */
let clientLoader = function(clientId) {
  return new Promise(function(accept, reject) {
    let client = _clients[clientId];
    if (client) {
      return accept(new API.authenticate.Client(client));
    }
    return reject();
  });
};

/**
 * Create a server listening to a given port
 *
 * options:
 * {
 *   port:      1201  // Port to listen on
 * }
 *
 * Return a promise for an instance of `http.Server`.
 */
let mockAuthServer = function(options) {
  // Set default options
  options = _.defaults({}, options, {
    port: 1201,
  });

  // Create validator
  return base.validator({
    publish: false,
  }).then(function(validator) {
    // Create express application
    let app = express();

    // Create API router
    let router = api.router({
      validator: validator,
      clientLoader: clientLoader,
    });
    // Mount router
    app.use(router);

    // Listen on given port
    return new Promise(function(accept, reject) {
      let server = app.listen(options.port);
      server.once('listening', function() {
        debug('Listening on port %d', server.address().port);
        accept(server);
      });
      server.once('error', reject);
    });
  });
};

// Export mockAuthServer
module.exports = mockAuthServer;

// Export API declaration
mockAuthServer.api = api;
