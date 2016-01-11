"use strict";

var _             = require('lodash');
var Promise       = require('promise');
var base          = require('taskcluster-base');
var taskcluster   = require('taskcluster-client');
var azureTable    = require('azure-table-node');

/** Declare API for mock authentication server */
var mockAuthApi = new base.API({
  title:        "Mock Auth Server",
  description:  "Auth server for testing"
});

/** Declare method to get credentails */
mockAuthApi.declare({
  method:       'get',
  route:        '/client/:clientId/credentials',
  name:         'getCredentials',
  scopes:       [['auth:credentials']],
  title:        "Get Credentials",
  description:  "Mock implementation of getCredentials"
}, function(req, res) {
  var clientId  = req.params.clientId;
  var client    = _.find(this.clients, {clientId: clientId});
  if (!client) {
    res.status(404).json({error: "ClientId not found"});
  }
  res.status(200).json(client);
});

/** Declare method for signature validation */
mockAuthApi.declare({
  method:       'post',
  route:        '/authenticate-hawk',
  name:         'authenticateHawk',
  title:        "Validate Hawk Signature",
  description:  "Mock implementation of authenticateHawk"
}, function(req, res) {
  return this.signatureValidator(req.body).then(function(result) {
    res.status(200).json(result);
  });
});

/** Mock API for azureTableSAS */
mockAuthApi.declare({
  method:       'get',
  route:        '/azure/:account/table/:table/read-write',
  name:         'azureTableSAS',
  deferAuth:    true,
  scopes:       [['auth:azure-table-access:<account>/<table>']],
  title:        "Get Azure SAS",
  description:  "Mock API for azureTableSAS"
}, function(req, res) {
  // Get parameters
  var account = req.params.account;
  var table   = req.params.table;
  var ctx     = this;

  // Check that the client is authorized to access given account and table
  if (!req.satisfies({account: account, table: table})) {
    return;
  }

  // Check that the account exists
  if (!ctx.azureAccounts[account]) {
    // Try to fetch from auth, if not specified directly
    var auth = new taskcluster.Auth({
      credentials:      ctx.credentials,
      baseUrl:          ctx.authBaseUrl
    });
    return auth.azureTableSAS(account, table).then(function(result) {
      return res.reply(result);
    }, function() {
      return res.status(404).json({
        message:    "Account '" + account + "' not found, can't delegate access"
      });
    });
  }

  // Construct client
  var client = azureTable.createClient({
    accountName:    account,
    accountKey:     ctx.azureAccounts[account],
    accountUrl:     ["https://", account, ".table.core.windows.net/"].join('')
  });

  // Ensure that the table is created
  var createdTable = new Promise(function(accept, reject) {
    client.createTable(table, {
      ignoreIfExists:     true
    }, function(err, data) {
      if (err) {
        return reject(err);
      }
      accept(data);
    });
  });

  // Once the table is created, construct and return SAS
  return createdTable.then(function() {
    // Construct SAS
    var expiry  = new Date(Date.now() + 25 * 60 * 1000);
    var sas     = client.generateSAS(table, 'raud', expiry, {
      start:  new Date(Date.now() - 15 * 60 * 1000)
    });

    // Return the generated SAS
    return res.reply({
      sas:      sas,
      expiry:   expiry.toJSON()
    });
  });
});


/** Create a clientLoader with a fixed set of clients */
var createClientLoader = function(clients) {
  return function(clientId) {
    return new Promise(function(accept, reject) {
      var client = _.find(clients, {clientId: clientId});
      if (client) {
        return accept(new base.API.authenticate.Client(client));
      }
      return reject();
    });
  };
};



/**
 * Create an mock authentication server for testing
 *
 * options: {
 *   clients: [
 *      {
 *        clientId:       "...",
 *        accessToken:    "...",
 *        scopes:         [...]
 *      }
 *   ],
 *   azureAccounts: {
 *      "<account>":      "<access-secret>"
 *   },
 *   // If not found in azureAccounts, credentials and authBaseUrl will be used
 *   // to fetch SAS.
 *   credentials: {
 *     clientId:          "...",
 *     accessToken:       "..."
 *   },
 *   authBaseUrl:         "..."   // Defaults to auth.taskcluster.net
 * }
 */
var createMockAuthServer = function(options) {
  // Set default options
  options = _.defaults({}, options || {}, {
    port:           1207,
    env:            'development',
    forceSSL:       false,
    trustProxy:     false,
    clients:        [],
    azureAccounts:  {}
  });

  return base.validator().then(function(validator) {
    // Create application
    var app = base.app(options);

    var signatureValidator = base.API.createSignatureValidator({
      clientLoader: function(clientId) {
        var client = _.find(options.clients, {
          clientId: clientId
        });
        if (!client) {
          throw new Error("No such clientId: " + clientId);
        }
        return client;
      }
    });

    // Create router for the API
    var router =  mockAuthApi.router({
      context: {
        clients:            options.clients,
        azureAccounts:      options.azureAccounts,
        credentials:        options.credentials,
        authBaseUrl:        options.authBaseUrl,
        signatureValidator: signatureValidator
      },
      validator:          validator,
      signatureValidator: signatureValidator
    });

    // Mount router
    app.use('/v1', router);

    // Create server
    return app.createServer().then(function(server) {
      // Time out connections after 500 ms, prevents tests from hanging
      server.setTimeout(500);
      return server;
    });
  });
};

// Export mockAuthApi
createMockAuthServer.mockAuthApi = mockAuthApi;

// Export createMockAuthServer
module.exports = createMockAuthServer;

