var debug       = require('debug')('routes:api:v1');
var assert      = require('assert');
var base        = require('taskcluster-base');
var slugid      = require('slugid');
var azure       = require('fast-azure-storage');
var Promise     = require('promise');
var _           = require('lodash');

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
  scopes:     ['auth:list-clients'],
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
    "Get an SAS string for use with a specific Azure Table Storage table.",
    "Note, this will create the table, if it doesn't already exists."
  ].join('\n')
}, async function(req, res) {
  // Get parameters
  var account   = req.params.account;
  var tableName = req.params.table;

  // Check that the client is authorized to access given account and table
  if (!req.satisfies({
    account:    account,
    table:      tableName
  })) {
    return;
  }

  // Check that the account exists
  if (!this.azureAccounts[account]) {
    return res.status(404).json({
      message:    "Account '" + account + "' not found, can't delegate access"
    });
  }

  // Construct client
  var table = new azure.Table({
    accountId:  account,
    accessKey:  this.azureAccounts[account]
  });

  // Create table ignore error, if it already exists
  try {
    await table.createTable(tableName);
  } catch (err) {
    if (err.code !== 'TableAlreadyExists') {
      throw err;
    }
  }

  // Construct SAS
  var expiry = new Date(Date.now() + 25 * 60 * 1000);
  var sas = table.sas(tableName, {
    start:    new Date(Date.now() - 15 * 60 * 1000),
    expiry:   expiry,
    permissions: {
      read:       true,
      add:        true,
      update:     true,
      delete:     true
    }
  });

  // Return the generated SAS
  return res.reply({
    sas:      sas,
    expiry:   expiry.toJSON()
  });
});

api.declare({
  method:     'get',
  route:      '/aws/s3/:level/:bucket/:prefix(*)',
  name:       'awsS3Credentials',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'aws-s3-credentials-response.json#',
  deferAuth:  true,
  scopes:     ['auth:aws-s3:<level>:<bucket>/<prefix>'],
  title:      "Get Temporary Read/Write Credentials S3",
  description: [
    "Get temporary AWS credentials for `read-write` or `read-only` access to",
    "a given `bucket` and `prefix` within that bucket.",
    "The `level` parameter can be `read-write` or `read-only` and determines",
    "which type of credentials is returned. Please note that the `level`",
    "parameter is required in the scope guarding access.",
    "",
    "The credentials are set of expire after an hour, but this behavior may be",
    "subject to change. Hence, you should always read the `expires` property",
    "from the response, if you intent to maintain active credentials in your",
    "application.",
    "",
    "Please notice that your `prefix` may not start with slash `/`, it is",
    "allowed on S3, but we forbid it here to discourage bad behavior.",
    "Also note that if your `prefix` doesn't end in a slash `/` the STS",
    "credentials will not require one to be to inserted. This is mainly a",
    "concern when assigning scopes to users and doing this right will prevent",
    "poor behavior. After we often want the `prefix` to be a folder in a",
    "`/` delimited folder structure."
  ].join('\n')
}, async function(req, res) {
  var level   = req.params.level;
  var bucket  = req.params.bucket;
  var prefix  = req.params.prefix;

  // Validate that a proper value was given for level
  if (level !== 'read-write' && level !== 'read-only') {
    return res.status(400).json({
      message:      "the 'level' URL parameter must be read-only or read-write",
      levelGiven:   level
    });
  }

  // Check that the client is authorized to access given bucket and prefix
  if (!req.satisfies({
    level:      level,
    bucket:     bucket,
    prefix:     prefix
  })) {
    return;
  }

  // Prevent prefix to start with a slash, this is bad behavior. Technically
  // we could easily support it, S3 does, but people rarely wants double
  // slashes in their URIs intentionally.
  if (prefix[0] === '/') {
    return res.status(400).json({
      message:      "The `prefix` may not start with a slash `/`",
      prefix:       prefix
    });
  }

  // Decide actions to be allowed on S3 objects
  var objectActions = [
    's3:GetObject'
  ];
  if (level === 'read-write') {
    objectActions.push(
      's3:PutObject',
      's3:DeleteObject'
    );
  }

  // For details on the policy see: http://amzn.to/1ETStaL
  var iamReq = await this.sts.getFederationToken({
    Name:               'TemporaryS3ReadWriteCredentials',
    Policy:             JSON.stringify({
      Version:          '2012-10-17',
      Statement:[
        {
          Sid:            'ReadWriteObjectsUnderPrefix',
          Effect:         'Allow',
          Action:         objectActions,
          Resource: [
            'arn:aws:s3:::{{bucket}}/{{prefix}}*'
              .replace('{{bucket}}', bucket)
              .replace('{{prefix}}', prefix)
          ]
        }, {
          Sid:            'ListObjectsUnderPrefix',
          Effect:         'Allow',
          Action: [
            's3:ListBucket'
          ],
          Resource: [
            'arn:aws:s3:::{{bucket}}'
              .replace('{{bucket}}', bucket)
          ],
          Condition: {
            StringLike: {
              's3:prefix': [
                '{{prefix}}*'.replace('{{prefix}}', prefix)
              ]
            }
          }
        }, {
          Sid:            'GetBucketLocation',
          Effect:         'Allow',
          Action: [
            's3:GetBucketLocation'
          ],
          Resource: [
            'arn:aws:s3:::{{bucket}}'
              .replace('{{bucket}}', bucket)
          ]
        }
      ]
    }),
    DurationSeconds:    60 * 60   // Expire credentials in an hour
  }).promise();

  return res.reply({
    credentials: {
      accessKeyId:      iamReq.data.Credentials.AccessKeyId,
      secretAccessKey:  iamReq.data.Credentials.SecretAccessKey,
      sessionToken:     iamReq.data.Credentials.SessionToken
    },
    expires:            new Date(iamReq.data.Credentials.Expiration).toJSON()
  });
});

/** Export all clients */
api.declare({
  method:     'get',
  route:      '/export-clients',
  name:       'exportClients',
  input:      undefined,
  output:     SCHEMA_PREFIX_CONST + 'exported-clients.json#',
  scopes:     [['auth:export-clients', 'auth:credentials']],
  title:      "List Clients",
  description: [
    "Export all clients except the root client, as a JSON list.",
    "This list can be imported later using `importClients`."
  ].join('\n')
}, async function(req, res) {
  var clients = await this.Client.loadAll();
  return res.reply(
    clients
      .filter(client => client.clientId !== this.rootClientId)
      .map(client => {
        return {
          clientId:     client.clientId,
          accessToken:  client.accessToken,
          scopes:       client.scopes,
          expires:      client.expires.toJSON(),
          name:         client.name,
          description:  client.details.notes
        };
      })
  );
});

/** Import clients from JSON */
api.declare({
  method:     'post',
  route:      '/import-clients',
  name:       'importClients',
  input:      SCHEMA_PREFIX_CONST + 'exported-clients.json#',
  output:     SCHEMA_PREFIX_CONST + 'exported-clients.json#',
  scopes:     [
    ['auth:import-clients', 'auth:create-client', 'auth:credentials']
  ],
  title:      "Import Clients",
  description: [
    "Import client from JSON list, overwriting any clients that already",
    "exists. Returns a list of all clients imported."
  ].join('\n')
}, async function(req, res) {
  var input = req.body;

  var clients = await Promise.all(input.map(async (input) => {
    try {
      return await this.Client.create({
        version:      '0.2.0',
        clientId:     input.clientId,
        accessToken:  input.accessToken,
        scopes:       input.scopes,
        expires:      new Date(input.expires),
        name:         input.name,
        details: {
          notes:      input.description
        }
      });
    } catch(err) {
      // Handle existing entity errors only
      if (err.code !== 'EntityAlreadyExists') {
        throw err;
      }

      // Overwrite existing client
      var client = await this.Client.load(input.clientId);
      await client.modify(function() {
        this.clientId     = input.clientId;
        this.accessToken  = input.accessToken;
        this.scopes       = input.scopes;
        this.expires      = new Date(input.expires);
        this.name         = input.name;
        this.details = {
          notes:            input.description
        }
      });
      return client;
    }
  }));

  return res.reply(clients.map(client => {
    return {
      clientId:     client.clientId,
      accessToken:  client.accessToken,
      scopes:       client.scopes,
      expires:      client.expires.toJSON(),
      name:         client.name,
      description:  client.details.notes
    };
  }));
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

