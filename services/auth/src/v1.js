var debug       = require('debug')('auth:v1');
var assert      = require('assert');
var base        = require('taskcluster-base');
var API         = require('taskcluster-lib-api');
var slugid      = require('slugid');
var Promise     = require('promise');
var _           = require('lodash');
var signaturevalidator = require('./signaturevalidator');

/** API end-point for version v1/ */
var api = new API({
  title:      "Authentication API",
  description: [
    "Authentication related API end-points for TaskCluster and related",
    "services. These API end-points are of interest if you wish to:",
    "  * Authenticate request signed with TaskCluster credentials,",
    "  * Manage clients and roles,",
    "  * Inspect or audit clients and roles,",
    "  * Gain access to various services guarded by this API.",
    "",
    "### Clients",
    "The authentication service manages _clients_, at a high-level each client",
    "consists of a `clientId`, an `accessToken`, scopes, and some metadata.",
    "The `clientId` and `accessToken` can be used for authentication when",
    "calling TaskCluster APIs.",
    "",
    "The client's scopes control the client's access to TaskCluster resources.",
    "The scopes are *expanded* by substituting roles, as defined below.",
    "",
    "### Roles",
    "A _role_ consists of a `roleId`, a set of scopes and a description.",
    "Each role constitutes a simple _expansion rule_ that says if you have",
    "the scope: `assume:<roleId>` you get the set of scopes the role has.",
    "Think of the `assume:<roleId>` as a scope that allows a client to assume",
    "a role.",
    "",
    "As in scopes the `*` kleene star also have special meaning if it is",
    "located at the end of a `roleId`. If you have a role with the following",
    "`roleId`: `my-prefix*`, then any client which has a scope staring with",
    "`assume:my-prefix` will be allowed to assume the role.",
    "",
    "### Guarded Services",
    "The authentication service also has API end-points for delegating access",
    "to some guarded service such as AWS S3, or Azure Table Storage.",
    "Generally, we add API end-points to this server when we wish to use",
    "TaskCluster credentials to grant access to a third-party service used",
    "by many TaskCluster components.",
  ].join('\n'),
  schemaPrefix: 'http://schemas.taskcluster.net/auth/v1/',
  params: {
    // Patterns for auth
    clientId:   /^[A-Za-z0-9@\/:._-]+$/,
    roleId:     /^[\x20-\x7e]+$/,

    // Patterns for Azure
    account:    /^[a-z0-9]{3,24}$/,
    table:      /^[A-Za-z][A-Za-z0-9]{2,62}$/,

    // Patterns for AWS
    bucket:     /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/,
                // we could allow "." too, but S3 buckets with dot in the name
                // doesn't work well with HTTPS and virtual-style hosting.
                // Hence, we shouldn't encourage people to use them
    // Project for sentry (and other per project resources)
    project:    /^[a-zA-Z0-9_-]{1,22}$/,
  },
  context: [
    // Instances of data.Client and data.Role
    'Client', 'Role',

    // Publisher from exchanges.js
    'publisher',

    // ScopeResolver instance
    'resolver',

    // Instance of aws.sts with credentials
    'sts',

    // Mapping from azure account to accessKey
    'azureAccounts',

    // Signature validator
    'signatureValidator',

    // SentryManager from sentrymanager.js
    'sentryManager',

    // Statsum configuration {secret, baseUrl}
    'statsum',
  ]
});

// Export API
module.exports = api;


/** List clients */
api.declare({
  method:     'get',
  route:      '/clients/',
  query: {
    prefix: /^[A-Za-z0-9@/:._-]+$/,
  },
  name:       'listClients',
  input:      undefined,
  output:     'list-clients-response.json#',
  stability:  'stable',
  title:      "List Clients",
  description: [
    "Get a list of all clients.  With `prefix`, only clients for which",
    "it is a prefix of the clientId are returned.",
  ].join('\n')
}, async function(req, res) {
  let prefix = req.query.prefix;

  // Load all clients
  // TODO: as we acquire more clients, perform the prefix filtering in Azure
  let clients = [];
  await this.Client.scan({}, {
    handler: client => {
      if (!prefix || client.clientId.startsWith(prefix)) {
        clients.push(client.json());
      }
    }
  });

  res.reply(clients);
});


/** Get client */
api.declare({
  method:     'get',
  route:      '/clients/:clientId',
  name:       'client',
  input:      undefined,
  stability:  'stable',
  output:     'get-client-response.json#',
  title:      "Get Client",
  description: [
    "Get information about a single client."
  ].join('\n')
}, async function(req, res) {
  let clientId = req.params.clientId;

  // Load client
  let client = await this.Client.load({clientId}, true);

  if (!client) {
    return res.status(404).json({message: "Client not found!"});
  }

  res.reply(client.json());
});


/** Create client */
api.declare({
  method:     'put',
  route:      '/clients/:clientId',
  name:       'createClient',
  input:      'create-client-request.json#',
  output:     'create-client-response.json#',
  scopes:     [['auth:create-client:<clientId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Create Client",
  description: [
    "Create a new client and get the `accessToken` for this client.",
    "You should store the `accessToken` from this API call as there is no",
    "other way to retrieve it.",
    "",
    "If you loose the `accessToken` you can call `resetAccessToken` to reset",
    "it, and a new `accessToken` will be returned, but you cannot retrieve the",
    "current `accessToken`.",
    "",
    "If a client with the same `clientId` already exists this operation will",
    "fail. Use `updateClient` if you wish to update an existing client.",
    "",
    "The caller's scopes must satisfy `scopes`."
  ].join('\n')
}, async function(req, res) {
  let clientId  = req.params.clientId;
  let input     = req.body;
  let scopes    = input.scopes || [];

  // Check scopes
  if (!req.satisfies({clientId}) || !req.satisfies([scopes])) {
    return;
  }

  var accessToken = slugid.v4() + slugid.v4();
  let client = await this.Client.create({
    clientId:     clientId,
    description:  input.description,
    accessToken:  accessToken,
    expires:      new Date(input.expires),
    scopes:       scopes,
    disabled:     0,
    details: {
      created:      new Date().toJSON(),
      lastModified: new Date().toJSON(),
      lastDateUsed: new Date().toJSON(),
      lastRotated:  new Date().toJSON()
    }
  }).catch(async (err) => {
    // Only handle
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // Load client
    let client = await this.Client.load({clientId});

    // If stored client different or older than 15 min we return 409
    let created = new Date(client.details.created).getTime();
    if (client.description !== input.description ||
        client.expires.getTime() !== new Date(input.expires).getTime() ||
        !_.isEqual(client.scopes, scopes) ||
        client.disabled !== 0 ||
        created > Date.now() - 15 * 60 * 1000) {
      res.status(409).json({
        message: "client with same clientId already exists, possibly " +
                 "an issue with retry logic or idempotency"
      });
      return null;
    }

    return client;
  });

  // If no client it was already created
  if (!client) {
    return;
  }

  // Send pulse message
  await Promise.all([
    this.publisher.clientCreated({clientId}),
    this.resolver.reloadClient(clientId)
  ]);

  // Create result with access token
  let result = client.json();
  result.accessToken = client.accessToken;
  return res.reply(result);
});


/** Reset access token for client */
api.declare({
  method:     'post',
  route:      '/clients/:clientId/reset',
  name:       'resetAccessToken',
  input:      undefined,
  output:     'create-client-response.json#',
  scopes:     [['auth:reset-access-token:<clientId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Reset `accessToken`",
  description: [
    "Reset a clients `accessToken`, this will revoke the existing",
    "`accessToken`, generate a new `accessToken` and return it from this",
    "call.",
    "",
    "There is no way to retrieve an existing `accessToken`, so if you loose it",
    "you must reset the accessToken to acquire it again.",
  ].join('\n')
}, async function(req, res) {
  let clientId  = req.params.clientId;
  let input     = req.body;

  // Check scopes
  if (!req.satisfies({clientId})) {
    return;
  }

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.status(404).json({message: "Client not found!"});
  }

  // Reset accessToken
  await client.modify(client => {
    client.accessToken = slugid.v4() + slugid.v4();
    client.details.lastRotated = new Date().toJSON();
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId)
  ]);

  // Create result with access token
  let result = client.json(this.resovler);
  result.accessToken = client.accessToken;
  return res.reply(result);
});


/** Update client */
api.declare({
  method:     'post',
  route:      '/clients/:clientId',
  name:       'updateClient',
  input:      'create-client-request.json#',
  output:     'get-client-response.json#',
  scopes:     [['auth:update-client:<clientId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Update Client",
  description: [
    "Update an exisiting client. The `clientId` and `accessToken` cannot be",
    "updated, but `scopes` can be modified.  The caller's scopes must",
    "satisfy all scopes being added to the client in the update operation.",
    "If no scopes are given in the request, the client's scopes remain",
    "unchanged"
  ].join('\n')
}, async function(req, res) {
  let clientId  = req.params.clientId;
  let input     = req.body;

  // Check scopes
  if (!req.satisfies({clientId})) {
    return;
  }

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.status(404).json({message: "Client not found!"});
  }

  let added = _.without.apply(_, [input.scopes].concat(client.scopes));
  if (!req.satisfies([added])) {
    return;
  }

  // Update client
  await client.modify(client => {
    client.description = input.description;
    client.expires = new Date(input.expires);
    client.details.lastModified = new Date().toJSON();
    if (input.scopes) {
      client.scopes = input.scopes;
    }
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId)
  ]);

  return res.reply(client.json());
});


/** Enable client */
api.declare({
  method:     'post',
  route:      '/clients/:clientId/enable',
  name:       'enableClient',
  input:      undefined,
  output:     'get-client-response.json#',
  scopes:     [['auth:enable-client:<clientId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Enable Client",
  description: [
    "Enable a client that was disabled with `disableClient`.  If the client",
    "is already enabled, this does nothing.",
    "",
    "This is typically used by identity providers to re-enable clients that",
    "had been disabled when the corresponding identity's scopes changed."
  ].join('\n')
}, async function(req, res) {
  let clientId  = req.params.clientId;

  // Check scopes
  if (!req.satisfies({clientId})) {
    return;
  }

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.status(404).json({message: "Client not found!"});
  }

  // Update client
  await client.modify(client => {
    client.disabled = 0;
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId)
  ]);

  return res.reply(client.json());
});


/** Disable client */
api.declare({
  method:     'post',
  route:      '/clients/:clientId/disable',
  name:       'disableClient',
  input:      undefined,
  output:     'get-client-response.json#',
  scopes:     [['auth:disable-client:<clientId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Disable Client",
  description: [
    "Disable a client.  If the client is already disabled, this does nothing.",
    "",
    "This is typically used by identity providers to disable clients when the",
    "corresponding identity's scopes no longer satisfy the client's scopes."
  ].join('\n')
}, async function(req, res) {
  let clientId  = req.params.clientId;

  // Check scopes
  if (!req.satisfies({clientId})) {
    return;
  }

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.status(404).json({message: "Client not found!"});
  }

  // Update client
  await client.modify(client => {
    client.disabled = 1;
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId)
  ]);

  return res.reply(client.json());
});


/** Delete client */
api.declare({
  method:     'delete',
  route:      '/clients/:clientId',
  name:       'deleteClient',
  scopes:     [['auth:delete-client:<clientId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Delete Client",
  description: [
    "Delete a client, please note that any roles related to this client must",
    "be deleted independently.",
  ].join('\n')
}, async function(req, res) {
  let clientId  = req.params.clientId;

  // Check scopes
  if (!req.satisfies({clientId})) {
    return;
  }

  await this.Client.remove({clientId}, true);

  await Promise.all([
    this.publisher.clientDeleted({clientId}),
    this.resolver.reloadClient(clientId)
  ]);

  return res.status(200).send();
});


/** List roles */
api.declare({
  method:     'get',
  route:      '/roles/',
  name:       'listRoles',
  input:      undefined,
  output:     'list-roles-response.json#',
  stability:  'stable',
  title:      "List Roles",
  description: [
    "Get a list of all roles, each role object also includes the list of",
    "scopes it expands to."
  ].join('\n')
}, async function(req, res) {
  // Load all roles
  let roles = [];
  await this.Role.scan({}, {
    handler: role => roles.push(role.json())
  });

  res.reply(roles);
});


/** Get role */
api.declare({
  method:     'get',
  route:      '/roles/:roleId',
  name:       'role',
  input:      undefined,
  output:     'get-role-response.json#',
  stability:  'stable',
  title:      "Get Role",
  description: [
    "Get information about a single role, including the set of scopes that the",
    "role expands to.",
  ].join('\n')
}, async function(req, res) {
  let roleId = req.params.roleId;

  // Load role
  let role = await this.Role.load({roleId}, true);

  if (!role) {
    return res.status(404).json({message: "Role not found!"});
  }

  res.reply(role.json());
});


/** Create role */
api.declare({
  method:     'put',
  route:      '/roles/:roleId',
  name:       'createRole',
  input:      'create-role-request.json#',
  output:     'get-role-response.json#',
  scopes:     [['auth:create-role:<roleId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Create Role",
  description: [
    "Create a new role.",
    "",
    "The caller's scopes must satisfy the new role's scopes.",
    "",
    "If there already exists a role with the same `roleId` this operation",
    "will fail. Use `updateRole` to modify an existing role.",
  ].join('\n')
}, async function(req, res) {
  let roleId    = req.params.roleId;
  let input     = req.body;

  // Check scopes
  if (!req.satisfies({roleId}) || !req.satisfies([input.scopes])) {
    return;
  }

  let role = await this.Role.create({
    roleId:       roleId,
    description:  input.description,
    scopes:       input.scopes,
    details: {
      created:      new Date().toJSON(),
      lastModified: new Date().toJSON()
    }
  }).catch(async (err) => {
    // Only handle
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // Load role
    let role = await this.Role.load({roleId});

    // If stored role different or older than 15 min we return 409
    let created = new Date(role.details.created).getTime();
    if (role.description !== input.description ||
        !_.isEqual(role.scopes, input.scopes) ||
        role > Date.now() - 15 * 60 * 1000) {
      res.status(409).json({
        message: "Role with same roleId already exists, possibly " +
                 "an issue with retry logic or idempotency"
      });
      return null;
    }

    return role;
  });


  // If no role it was already created
  if (!role) {
    return;
  }

  // Send pulse message
  await Promise.all([
    this.publisher.roleCreated({roleId}),
    this.resolver.reloadRole(roleId)
  ]);

  // Send result
  return res.reply(role.json());
});


/** Update role */
api.declare({
  method:     'post',
  route:      '/roles/:roleId',
  name:       'updateRole',
  input:      'create-role-request.json#',
  output:     'get-role-response.json#',
  scopes:     [['auth:update-role:<roleId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Update Role",
  description: [
    "Update an existing role.",
    "",
    "The caller's scopes must satisfy all of the new scopes being added, but",
    "need not satisfy all of the client's existing scopes.",
  ].join('\n')
}, async function(req, res) {
  let roleId    = req.params.roleId;
  let input     = req.body;

  // Check scopes
  if (!req.satisfies({roleId})) {
    return;
  }

  // Load role
  let role = await this.Role.load({roleId}, true);
  if (!role) {
    return res.status(404).json({message: "role not found!"});
  }

  // Check that requester has all the scopes added
  let added = _.without.apply(_, [input.scopes].concat(role.scopes));
  if (!req.satisfies([added])) {
    return;
  }

  // Update role
  await role.modify(role => {
    role.description = input.description;
    role.scopes = input.scopes;
    role.details.lastModified = new Date().toJSON();
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.roleUpdated({roleId}),
    this.resolver.reloadRole(roleId)
  ]);

  return res.reply(role.json());
});


/** Delete role */
api.declare({
  method:     'delete',
  route:      '/roles/:roleId',
  name:       'deleteRole',
  scopes:     [['auth:delete-role:<roleId>']],
  deferAuth:  true,
  stability:  'stable',
  title:      "Delete Role",
  description: [
    "Delete a role. This operation will succeed regardless of whether or not",
    "the role exists."
  ].join('\n')
}, async function(req, res) {
  let roleId  = req.params.roleId;

  // Check scopes
  if (!req.satisfies({roleId})) {
    return;
  }

  await this.Role.remove({roleId}, true);

  await Promise.all([
    this.publisher.roleDeleted({roleId}),
    this.resolver.reloadRole(roleId)
  ]);

  return res.reply();
});

/** Expand a scopeset */
api.declare({
  method:     'get',
  route:      '/scopes/expand',
  name:       'expandScopes',
  input:      'scopeset.json#',
  output:     'scopeset.json#',
  stability:  'stable',
  title:      "Expand Scopes",
  description: [
    "Return an expanded copy of the given scopeset, with scopes implied by any",
    "roles included."
  ].join('\n')
}, async function(req, res) {
  let input = req.body;
  return res.reply({scopes: this.resolver.resolve(input.scopes)});
});

/** Get the request scopes */
api.declare({
  method:     'get',
  route:      '/scopes/current',
  name:       'currentScopes',
  output:     'scopeset.json#',
  stability:  'stable',
  title:      "Get Current Scopes",
  description: [
    "Return the expanded scopes available in the request, taking into account all sources",
    "of scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,",
    "and roles)."
  ].join('\n')
}, async function(req, res) {
  let input = req.body;
  return res.reply({scopes: await req.scopes()})
});

// Load aws and azure API implementations, these loads API and declares methods
// on the API object exported from this file
require('./aws');
require('./azure');
require('./sentry');
require('./statsum');

/** Get all client information */
api.declare({
  method:     'post',
  route:      '/authenticate-hawk',
  name:       'authenticateHawk',
  input:      'authenticate-hawk-request.json#',
  output:     'authenticate-hawk-response.json#',
  stability:  'stable',
  title:      "Authenticate Hawk Request",
  description: [
    "Validate the request signature given on input and return list of scopes",
    "that the authenticating client has.",
    "",
    "This method is used by other services that wish rely on TaskCluster",
    "credentials for authentication. This way we can use Hawk without having",
    "the secret credentials leave this service."
  ].join('\n')
}, function(req, res) {
  return this.signatureValidator(req.body).then(result => res.reply(result));
});


api.declare({
  method:     'post',
  route:      '/test-authenticate',
  name:       'testAuthenticate',
  input:      'test-authenticate-request.json#',
  output:     'test-authenticate-response.json#',
  stability:  'stable',
  title:      "Test Authentication",
  description: [
    "Utility method to test client implementations of TaskCluster",
    "authentication.",
    "",
    "Rather than using real credentials, this endpoint accepts requests with",
    "clientId `tester` and accessToken `no-secret`. That client's scopes are",
    "based on `clientScopes` in the request body.",
    "",
    "The request is validated, with any certificate, authorizedScopes, etc.",
    "applied, and the resulting scopes are checked against `requiredScopes`",
    "from the request body. On success, the response contains the clientId",
    "and scopes as seen by the API method.",
  ].join('\n')
}, async function(req, res) {
  API.remoteAuthentication({
    signatureValidator: signaturevalidator.createSignatureValidator({
      clientLoader: async (clientId) => {
        if (clientId !== 'tester') {
          throw new Error("Client with clientId '" + clientId + "' not found");
        }
        return {
          clientId: 'tester',
          accessToken: 'no-secret',
          scopes: req.body.clientScopes,
        };
      }
    }),
  }, {
    scopes: [],
    deferAuth: true,
  })(req, res, () => {
    if (!req.satisfies([req.body.requiredScopes])) {
      return;
    }
    Promise.all([
      req.clientId(),
      req.scopes(),
    ]).then(([clientId, scopes]) => {
      res.reply({clientId, scopes});
    }).catch(err => {
      return res.reportInternalError(err);
    });
  });
});

api.declare({
  method:     'get',
  route:      '/test-authenticate-get/',
  name:       'testAuthenticateGet',
  output:     'test-authenticate-response.json#',
  stability:  'stable',
  title:      "Test Authentication (GET)",
  description: [
    "Utility method similar to `testAuthenticate`, but with the GET method,",
    "so it can be used with signed URLs (bewits).",
    "",
    "Rather than using real credentials, this endpoint accepts requests with",
    "clientId `tester` and accessToken `no-secret`. That client's scopes are",
    "`['test:*', 'auth:create-client:test:*']`.  The call fails if the ",
    "`test:authenticate-get` scope is not available.",
    "",
    "The request is validated, with any certificate, authorizedScopes, etc.",
    "applied, and the resulting scopes are checked, just like any API call.",
    "On success, the response contains the clientId and scopes as seen by",
    "the API method.",
    "",
    "This method may later be extended to allow specification of client and",
    "required scopes via query arguments.",
  ].join('\n')
}, async function(req, res) {
  API.remoteAuthentication({
    signatureValidator: signaturevalidator.createSignatureValidator({
      clientLoader: async (clientId) => {
        if (clientId !== 'tester') {
          throw new Error("Client with clientId '" + clientId + "' not found");
        }
        return {
          clientId: 'tester',
          accessToken: 'no-secret',
          scopes: ['test:*', 'auth:create-client:test:*'],
        };
      }
    }),
  }, {
    scopes: [['test:authenticate-get']],
  })(req, res, () => {
    Promise.all([
      req.clientId(),
      req.scopes(),
    ]).then(([clientId, scopes]) => {
      res.reply({clientId, scopes});
    }).catch(err => {
      return res.reportInternalError(err);
    });
  });
});

/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  stability:  'experimental',
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
