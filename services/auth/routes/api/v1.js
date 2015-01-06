var debug       = require('debug')('routes:api:v1');
var assert      = require('assert');
var base        = require('taskcluster-base');
var slugid      = require('slugid');
var azureTable  = require('azure-table-node');

/** API end-point for version v1/ */
var api = new base.API({
  title:      "Authentication API",
  description: [
    "Authentication related API end-points for taskcluster."
  ].join('\n')
});

// Export API
module.exports = api;

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/auth/v1/';

// Note: No API end-point not requiring the 'auth:credentials' scopes should
//       be allowed to return an accessToken.

/** Get authorized scopes for a given client */
api.declare({
  method:     'get',
  route:      '/client/:clientId/scopes',
  name:       'scopes',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'client-scopes-response.json#',
  scopes:     ['auth:inspect', 'auth:credentials'],
  title:      "Get Client Authorized Scopes",
  description: [
    "Returns the scopes the client is authorized to access and the date-time",
    "where the clients authorization is set to expire.",
    "",
    "This API end-point allows you inspect clients without getting access to",
    "credentials, as provide by the `getCredentials` request below."
  ].join('\n')
}, function(req, res) {
  return this.Client.load(req.params.clientId).then(function(client) {
    return res.reply({
      clientId:     client.clientId,
      scopes:       client.scopes,
      expires:      client.expires.toJSON()
    });
  }, function(err) {
    // Return 404, if client wasn't found
    if (err.code === 'ResourceNotFound') {
      return res.status(404).json({
        message:    "Client not found"
      });
    }
    throw err;
  });
});


/** Get credentials for a given client */
api.declare({
  method:     'get',
  route:      '/client/:clientId/credentials',
  name:       'getCredentials',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'client-credentials-response.json#',
  scopes:     ['auth:credentials'],
  title:      "Get Client Credentials",
  description: [
    "Returns the clients `accessToken` as needed for verifying signatures.",
    "This API end-point also returns the list of scopes the client is",
    "authorized for and the date-time where the client authorization expires",
    "",
    "Remark, **if you don't need** the `accessToken` but only want to see what",
    "scopes a client is authorized for, you should use the `getScopes`",
    "function described above."
  ].join('\n')
}, function(req, res) {
  return this.Client.load(req.params.clientId).then(function(client) {
    return res.reply({
      clientId:     client.clientId,
      accessToken:  client.accessToken,
      scopes:       client.scopes,
      expires:      client.expires.toJSON()
    });
  }, function(err) {
    // Return 404, if client wasn't found
    if (err.code === 'ResourceNotFound') {
      return res.status(404).json({
        message:    "Client not found"
      });
    }
    throw err;
  });
});


/** Get all client information */
api.declare({
  method:     'get',
  route:      '/client/:clientId',
  name:       'client',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'get-client-response.json#',
  scopes:     ['auth:credentials'],
  title:      "Get Client Information",
  description: [
    "Returns all information about a given client. This end-point is mostly",
    "building tools to administrate clients. Do not use if you only want to",
    "authenticate a request, see `getCredentials` for this purpose."
  ].join('\n')
}, function(req, res) {
  return this.Client.load(req.params.clientId).then(function(client) {
    return res.reply({
      clientId:     client.clientId,
      accessToken:  client.accessToken,
      scopes:       client.scopes,
      expires:      client.expires.toJSON(),
      name:         client.name,
      description:  client.details.notes
    });
  }, function(err) {
    // Return 404, if client wasn't found
    if (err.code === 'ResourceNotFound') {
      return res.status(404).json({
        message:    "Client not found"
      });
    }
    throw err;
  });
});


/** Create client information */
api.declare({
  method:     'put',
  route:      '/client/:clientId',
  name:       'createClient',
  input:      SCHEMA_PREFIX_CONST + 'create-client-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'get-client-response.json#',
  scopes:     [['auth:create-client', 'auth:credentials']],
  title:      "Create Client",
  description: [
    "Create client with given `clientId`, `name`, `expires`, `scopes` and",
    "`description`. The `accessToken` will always be generated server-side,",
    "and will be returned from this request.",
    "",
    "**Required scopes**, in addition the scopes listed",
    "above, the caller must also posses the all the scopes that is given to",
    "the client that is created."
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var clientId  = req.params.clientId;
  var input     = req.body;

  // Authenticate request checking that owner has delegate scopes
  if (!req.satisfies([input.scopes])) {
    return;
  }

  // Attempt to create the client
  return ctx.Client.create({
    version:      '0.2.0',
    clientId:     clientId,
    accessToken:  slugid.v4() + slugid.v4(),
    scopes:       input.scopes,
    expires:      new Date(input.expires),
    name:         input.name,
    details: {
      notes:      input.description
    }
  }).then(undefined, function(err) {
    if (err.code === 'EntityAlreadyExists') {
      // If client already exists, we load it and check if it has the values
      // we're trying to set, ensure the operation is idempotent
      return ctx.Client.load(clientId).then(function(client) {
        // If properties match, then we pretend the operation just happened
        if (_.isEqual(client.scopes, input.scopes) &&
            client.expires.getTime() === new Date(input.expires).getTime() &&
            client.name === input.name &&
            client.details.notes === input.description) {
          return client;
        }
        res.status(409).json({
          message:    "Client already exists"
        });
        return undefined;
      });
    }
    debug("Failed to create client, err: %s, JSON: %j", err, err);
    // Cause an internal error
    throw err;
  }).then(function(client) {
    // Reply was already sent above
    if (client === undefined) {
      return;
    }
    // Send a reply
    return res.reply({
      clientId:     client.clientId,
      accessToken:  client.accessToken,
      scopes:       client.scopes,
      expires:      client.expires.toJSON(),
      name:         client.name,
      description:  client.details.notes
    });
  });
});


/** Modify client information */
api.declare({
  method:     'post',
  route:      '/client/:clientId/modify',
  name:       'modifyClient',
  input:      SCHEMA_PREFIX_CONST + 'create-client-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'get-client-response.json#',
  scopes:     [['auth:modify-client', 'auth:credentials']],
  title:      "Modify Client",
  description: [
    "Modify client `name`, `expires`, `scopes` and",
    "`description`.",
    "",
    "**Required scopes**, in addition the scopes listed",
    "above, the caller must also posses the all the scopes that is given to",
    "the client that is updated."
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var clientId  = req.params.clientId;
  var input     = req.body;

  // Authenticate request checking that owner has delegate scopes
  if (!req.satisfies([input.scopes])) {
    return;
  }

  // Load client
  return ctx.Client.load(clientId).then(function(client) {
    return client.modify(function() {
      this.scopes         = input.scopes;
      this.expires        = new Date(input.expires);
      this.name           = input.name;
      this.details.notes  = input.description;
    }).then(function(client) {
      return res.reply({
        clientId:     client.clientId,
        accessToken:  client.accessToken,
        scopes:       client.scopes,
        expires:      client.expires.toJSON(),
        name:         client.name,
        description:  client.details.notes
      });
    });
  }, function(err) {
    // Return 404, if client wasn't found
    if (err.code === 'ResourceNotFound') {
      return res.status(404).json({
        message:    "Client not found"
      });
    }
    throw err;
  });
});


/** Delete client information */
api.declare({
  method:     'delete',
  route:      '/client/:clientId',
  name:       'removeClient',
  input:      undefined,
  output:     undefined,
  scopes:     ['auth:remove-client'],
  title:      "Remove Client",
  description: [
    "Delete a client with given `clientId`."
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var clientId  = req.params.clientId;

  // Remove client
  return ctx.Client.remove(clientId).then(function() {
    res.reply({});
  });
});


/** Reset accessToken for a client */
api.declare({
  method:     'post',
  route:      '/client/:clientId/reset-credentials',
  name:       'resetCredentials',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'get-client-response.json#',
  scopes:     [['auth:reset-credentials', 'auth:credentials']],
  title:      "Reset Client Credentials",
  description: [
    "Reset credentials for a client. This will generate a new `accessToken`.",
    "as always the `accessToken` will be generated server-side and returned."
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var clientId  = req.params.clientId;

  // Load client
  return ctx.Client.load(clientId).then(function(client) {
    return client.modify(function() {
      this.accessToken = slugid.v4() + slugid.v4();
    }).then(function(client) {
      return res.reply({
        clientId:     client.clientId,
        accessToken:  client.accessToken,
        scopes:       client.scopes,
        expires:      client.expires.toJSON(),
        name:         client.name,
        description:  client.details.notes
      });
    });
  }, function(err) {
    // Return 404, if client wasn't found
    if (err.code === 'ResourceNotFound') {
      return res.status(404).json({
        message:    "Client not found"
      });
    }
    throw err;
  });
});


/** List all clients */
api.declare({
  method:     'get',
  route:      '/list-clients',
  name:       'listClients',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'list-clients-response.json#',
  scopes:     ['auth:client-clients'],
  title:      "List Clients",
  description: [
    "Return list with all clients"  // consider $top = 10
  ].join('\n')
}, function(req, res) {
  return this.Client.loadAll().then(function(clients) {
    return res.reply(clients.map(function(client) {
      return {
        clientId:     client.clientId,
        scopes:       client.scopes,
        expires:      client.expires.toJSON(),
        name:         client.name,
        description:  client.details.notes
      };
    }));
  });
});

api.declare({
  method:     'get',
  route:      '/azure/:account/table/:table/read-write',
  name:       'azureTableSAS',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'azure-table-access-response.json#',
  deferAuth:  true,
  scopes:     ['auth:azure-table-access:<account>/<table>'],
  title:      "Get Shared-Access-Signature for Azure Table",
  description: [
    "Get an SAS string for use with azure table storage"
  ].join('\n')
}, function(req, res) {
  // Get parameters
  var account = req.params.account;
  var table   = req.params.table;
  var ctx     = this;

  // Check that the client is authorized to access given account and table
  if (!req.satisfies({account: account, table: table})) {
    return;
  }

  debug("ctx.azureAccounts: %s", account);
  debug(Object.keys(ctx.azureAccounts));
  debug("typeof(ctx.azureAccounts[account]): %j", typeof(ctx.azureAccounts[account]));
  debug("ctx.azureAccounts: %j", ctx.azureAccounts);

  // Check that the account exists
  if (!ctx.azureAccounts[account]) {
    return res.status(404).json({
      message:    "Account '" + account + "'' not found, can't delegate access"
    });
  }

  // Construct client
  var client = azureTable.createClient({
    accountName:    account,
    accountKey:     ctx.azureAccounts[account],
    accountUrl:     ["https://", account, ".table.core.windows.net/"].join('')
  });

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


/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  title:    "Ping Server",
  description: [
    "Documented later...",
    "",
    "**Warning** this api end-point is **not stable**."
  ].join('\n')
}, function(req, res) {
  res.status(200).json({
    alive:    true,
    uptime:   process.uptime()
  });
});

