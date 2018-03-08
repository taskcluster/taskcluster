var debug       = require('debug')('auth:api');
var assert      = require('assert');
var API         = require('taskcluster-lib-api');
var scopeUtils  = require('taskcluster-lib-scopes');
var slugid      = require('slugid');
var Promise     = require('promise');
var _           = require('lodash');
var signaturevalidator = require('./signaturevalidator');
let ScopeResolver      = require('./scoperesolver');

/**
 * Helper to return a role as defined in the blob to one suitable for return.
 * This involves adding expandedRoles using the resolver.
 */
const roleToJson = (role, context) => _.defaults(
  {expandedScopes: context.resolver.resolve([`assume:${role.roleId}`])},
  role
);

/** API end-point for version v1/ */
var api = new API({
  title:      'Authentication API',
  description: [
    'Authentication related API end-points for Taskcluster and related',
    'services. These API end-points are of interest if you wish to:',
    '  * Authorize a request signed with Taskcluster credentials,',
    '  * Manage clients and roles,',
    '  * Inspect or audit clients and roles,',
    '  * Gain access to various services guarded by this API.',
    '',
    'Note that in this service "authentication" refers to validating the',
    'correctness of the supplied credentials (that the caller posesses the',
    'appropriate access token). This service does not provide any kind of user',
    'authentication (identifying a particular person).',
    '',
    '### Clients',
    'The authentication service manages _clients_, at a high-level each client',
    'consists of a `clientId`, an `accessToken`, scopes, and some metadata.',
    'The `clientId` and `accessToken` can be used for authentication when',
    'calling Taskcluster APIs.',
    '',
    'The client\'s scopes control the client\'s access to Taskcluster resources.',
    'The scopes are *expanded* by substituting roles, as defined below.',
    '',
    '### Roles',
    'A _role_ consists of a `roleId`, a set of scopes and a description.',
    'Each role constitutes a simple _expansion rule_ that says if you have',
    'the scope: `assume:<roleId>` you get the set of scopes the role has.',
    'Think of the `assume:<roleId>` as a scope that allows a client to assume',
    'a role.',
    '',
    'As in scopes the `*` kleene star also have special meaning if it is',
    'located at the end of a `roleId`. If you have a role with the following',
    '`roleId`: `my-prefix*`, then any client which has a scope staring with',
    '`assume:my-prefix` will be allowed to assume the role.',
    '',
    '### Guarded Services',
    'The authentication service also has API end-points for delegating access',
    'to some guarded service such as AWS S3, or Azure Table Storage.',
    'Generally, we add API end-points to this server when we wish to use',
    'Taskcluster credentials to grant access to a third-party service used',
    'by many Taskcluster components.',
  ].join('\n'),
  schemaPrefix: 'http://schemas.taskcluster.net/auth/v1/',
  params: {
    // Patterns for auth
    clientId:   /^[A-Za-z0-9!@/:.+|_-]+$/, // should match schemas/constants.yml
    roleId:     /^[\x20-\x7e]+$/,

    // Patterns for Azure
    account:    /^[a-z0-9]{3,24}$/,
    table:      /^[A-Za-z][A-Za-z0-9]{2,62}$/,
    container:  /^(?!.*[-]{2})[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
    level:      /^(read-write|read-only)$/,

    // Patterns for AWS
    bucket:     /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/,
    // we could allow "." too, but S3 buckets with dot in the name
    // doesn't work well with HTTPS and virtual-style hosting.
    // Hence, we shouldn't encourage people to use them
    // Project for sentry (and other per project resources)
    project:    /^[a-zA-Z0-9_-]{1,22}$/,
  },
  context: [
    // Instances of data tables
    'Client', 'Roles',

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

    // A tc-lib-monitor for use beyond the lib-api level
    'monitor',
  ],
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
  title:      'List Clients',
  description: [
    'Get a list of all clients.  With `prefix`, only clients for which',
    'it is a prefix of the clientId are returned.',
  ].join('\n'),
}, async function(req, res) {
  let prefix = req.query.prefix;

  // Load all clients
  // TODO: as we acquire more clients, perform the prefix filtering in Azure
  let clients = [];
  await this.Client.scan({}, {
    handler: client => {
      if (!prefix || client.clientId.startsWith(prefix)) {
        clients.push(client.json(this.resolver));
      }
    },
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
  title:      'Get Client',
  description: [
    'Get information about a single client.',
  ].join('\n'),
}, async function(req, res) {
  let clientId = req.params.clientId;

  // Load client
  let client = await this.Client.load({clientId}, true);

  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  res.reply(client.json(this.resolver));
});

/** Create client */
api.declare({
  method:     'put',
  route:      '/clients/:clientId',
  name:       'createClient',
  input:      'create-client-request.json#',
  output:     'create-client-response.json#',
  scopes: {
    AllOf: [
      'auth:create-client:<clientId>',
      {for: 'scope', in: 'scopes', each: '<scope>'},
    ],
  },
  stability:  'stable',
  title:      'Create Client',
  description: [
    'Create a new client and get the `accessToken` for this client.',
    'You should store the `accessToken` from this API call as there is no',
    'other way to retrieve it.',
    '',
    'If you loose the `accessToken` you can call `resetAccessToken` to reset',
    'it, and a new `accessToken` will be returned, but you cannot retrieve the',
    'current `accessToken`.',
    '',
    'If a client with the same `clientId` already exists this operation will',
    'fail. Use `updateClient` if you wish to update an existing client.',
    '',
    'The caller\'s scopes must satisfy `scopes`.',
  ].join('\n'),
}, async function(req, res) {
  let clientId  = req.params.clientId;
  let input     = req.body;
  let scopes    = input.scopes || [];

  // Check scopes
  await req.authorize({clientId, scopes});

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
      lastRotated:  new Date().toJSON(),
      deleteOnExpiration: !!input.deleteOnExpiration,
    },
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
      return res.reportError('RequestConflict',
        'client with same clientId already exists, possibly an issue with retry logic or idempotency',
        {});
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
    this.resolver.reloadClient(clientId),
  ]);

  // Create result with access token
  let result = client.json(this.resolver);
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
  scopes:     'auth:reset-access-token:<clientId>',
  stability:  'stable',
  title:      'Reset `accessToken`',
  description: [
    'Reset a clients `accessToken`, this will revoke the existing',
    '`accessToken`, generate a new `accessToken` and return it from this',
    'call.',
    '',
    'There is no way to retrieve an existing `accessToken`, so if you loose it',
    'you must reset the accessToken to acquire it again.',
  ].join('\n'),
}, async function(req, res) {
  let clientId  = req.params.clientId;
  let input     = req.body;

  // Check scopes
  await req.authorize({clientId});

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // Reset accessToken
  await client.modify(client => {
    client.accessToken = slugid.v4() + slugid.v4();
    client.details.lastRotated = new Date().toJSON();
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId),
  ]);

  // Create result with access token
  let result = client.json(this.resolver);
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
  scopes: {
    AllOf: [
      'auth:update-client:<clientId>',
      {for: 'scope', in: 'scopesAdded', each: '<scope>'},
    ],
  },
  stability:  'stable',
  title:      'Update Client',
  description: [
    'Update an exisiting client. The `clientId` and `accessToken` cannot be',
    'updated, but `scopes` can be modified.  The caller\'s scopes must',
    'satisfy all scopes being added to the client in the update operation.',
    'If no scopes are given in the request, the client\'s scopes remain',
    'unchanged',
  ].join('\n'),
}, async function(req, res) {
  let clientId  = req.params.clientId;
  let input     = req.body;

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // the new scopes must be satisfied by the combination of the existing
  // scopes and the caller's scopes
  const scopesAdded = _.difference(input.scopes, client.scopes);

  // Check scopes
  await req.authorize({clientId, scopesAdded});

  // Update client
  await client.modify(client => {
    client.description = input.description;
    client.expires = new Date(input.expires);
    client.details.lastModified = new Date().toJSON();
    client.details.deleteOnExpiration = !!input.deleteOnExpiration;
    if (input.scopes) {
      client.scopes = input.scopes;
    }
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId),
  ]);

  return res.reply(client.json(this.resolver));
});

/** Enable client */
api.declare({
  method:     'post',
  route:      '/clients/:clientId/enable',
  name:       'enableClient',
  input:      undefined,
  output:     'get-client-response.json#',
  scopes:     'auth:enable-client:<clientId>',
  stability:  'stable',
  title:      'Enable Client',
  description: [
    'Enable a client that was disabled with `disableClient`.  If the client',
    'is already enabled, this does nothing.',
    '',
    'This is typically used by identity providers to re-enable clients that',
    'had been disabled when the corresponding identity\'s scopes changed.',
  ].join('\n'),
}, async function(req, res) {
  let clientId  = req.params.clientId;

  // Check scopes
  await req.authorize({clientId});

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // Update client
  await client.modify(client => {
    client.disabled = 0;
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId),
  ]);

  return res.reply(client.json(this.resolver));
});

/** Disable client */
api.declare({
  method:     'post',
  route:      '/clients/:clientId/disable',
  name:       'disableClient',
  input:      undefined,
  output:     'get-client-response.json#',
  scopes:     'auth:disable-client:<clientId>',
  stability:  'stable',
  title:      'Disable Client',
  description: [
    'Disable a client.  If the client is already disabled, this does nothing.',
    '',
    'This is typically used by identity providers to disable clients when the',
    'corresponding identity\'s scopes no longer satisfy the client\'s scopes.',
  ].join('\n'),
}, async function(req, res) {
  let clientId  = req.params.clientId;

  // Check scopes
  await req.authorize({clientId});

  // Load client
  let client = await this.Client.load({clientId}, true);
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // Update client
  await client.modify(client => {
    client.disabled = 1;
  });

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({clientId}),
    this.resolver.reloadClient(clientId),
  ]);

  return res.reply(client.json(this.resolver));
});

/** Delete client */
api.declare({
  method:     'delete',
  route:      '/clients/:clientId',
  name:       'deleteClient',
  scopes:     'auth:delete-client:<clientId>',
  stability:  'stable',
  title:      'Delete Client',
  description: [
    'Delete a client, please note that any roles related to this client must',
    'be deleted independently.',
  ].join('\n'),
}, async function(req, res) {
  let clientId  = req.params.clientId;

  // Check scopes
  await req.authorize({clientId});

  await this.Client.remove({clientId}, true);

  await Promise.all([
    this.publisher.clientDeleted({clientId}),
    this.resolver.reloadClient(clientId),
  ]);

  return res.status(204).send();
});

/** List roles */
api.declare({
  method:     'get',
  route:      '/roles/',
  name:       'listRoles',
  input:      undefined,
  output:     'list-roles-response.json#',
  stability:  'stable',
  title:      'List Roles',
  description: [
    'Get a list of all roles, each role object also includes the list of',
    'scopes it expands to.',
  ].join('\n'),
}, async function(req, res) {
  // Load all roles
  let roles = await this.Roles.get();
  res.reply(roles.map(r => roleToJson(r, this)));
});

/** Get role */
api.declare({
  method:     'get',
  route:      '/roles/:roleId',
  name:       'role',
  input:      undefined,
  output:     'get-role-response.json#',
  stability:  'stable',
  title:      'Get Role',
  description: [
    'Get information about a single role, including the set of scopes that the',
    'role expands to.',
  ].join('\n'),
}, async function(req, res) {
  let roleId = req.params.roleId;

  // Load role
  let roles = await this.Roles.get();
  let role = _.find(roles, {roleId});

  if (!role) {
    return res.reportError('ResourceNotFound', 'Role not found', {});
  }

  res.reply(roleToJson(role, this));
});

/** Create role */
api.declare({
  method:     'put',
  route:      '/roles/:roleId',
  name:       'createRole',
  input:      'create-role-request.json#',
  output:     'get-role-response.json#',
  scopes: {
    AllOf: [
      'auth:create-role:<roleId>',
      {for: 'scope', in: 'scopes', each: '<scope>'},
    ],
  },
  stability:  'stable',
  title:      'Create Role',
  description: [
    'Create a new role.',
    '',
    'The caller\'s scopes must satisfy the new role\'s scopes.',
    '',
    'If there already exists a role with the same `roleId` this operation',
    'will fail. Use `updateRole` to modify an existing role.',
    '',
    'Creation of a role that will generate an infinite expansion will result',
    'in an error response.',
  ].join('\n'),
}, async function(req, res) {
  let roleId    = req.params.roleId;
  let input     = req.body;

  if (process.env.LOCK_ROLES === 'true') {
    return res.reportError('InputError',
      'Roles are temporarily locked during upgrade',
      {});
  }

  // Check scopes
  await req.authorize({roleId, scopes: input.scopes});

  input.scopes.sort(scopeUtils.scopeCompare);

  let when = new Date().toJSON();
  role = {
    roleId,
    description: input.description,
    scopes: input.scopes,
    lastModified: when,
    created: when,
  };

  // update Roles
  let reportError = (code, message, details) => {
    res.reportError(code, message, details);
    let err = new Error();
    err.code = 'ErrorReported';
    return err;
  };
  try {
    await this.Roles.modify(roles => {
      let existing = _.find(roles, {roleId});
      if (existing) {
        // role exists and doesn't match this one -> RequestConflict
        if (existing.description !== input.description || !_.isEqual(existing.scopes, input.scopes)) {
          throw reportError('RequestConflict',
            'Role with same roleId already exists',
            {});
        } else {
          role = existing;
          return;
        }
      }

      // check that this new role does not introduce a cycle
      let checkRoles = _.clone(roles);
      checkRoles.push(role);
      try {
        ScopeResolver.cycleCheck(checkRoles);
      } catch (e) {
        throw reportError('InputError', `Invalid roles: ${e.message}`, {});
      }

      // add the role for real
      roles.push(role);
    });
  } catch (e) {
    if (e.code === 'ErrorReported') {
      return;
    }
    throw e;
  }

  // Send pulse message and reload
  await Promise.all([
    this.publisher.roleCreated({roleId}),
    this.resolver.reloadRoles(),
  ]);

  // Send result
  return res.reply(roleToJson(role, this));
});

/** Update role */
api.declare({
  method:     'post',
  route:      '/roles/:roleId',
  name:       'updateRole',
  input:      'create-role-request.json#',
  output:     'get-role-response.json#',
  scopes: {
    AllOf: [
      'auth:update-role:<roleId>',
      {for: 'scope', in: 'scopesAdded', each: '<scope>'},
    ],
  },
  stability:  'stable',
  title:      'Update Role',
  description: [
    'Update an existing role.',
    '',
    'The caller\'s scopes must satisfy all of the new scopes being added, but',
    'need not satisfy all of the client\'s existing scopes.',
    '',
    'An update of a role that will generate an infinite expansion will result',
    'in an error response.',
  ].join('\n'),
}, async function(req, res) {
  let roleId    = req.params.roleId;
  let input     = req.body;
  let role;

  if (process.env.LOCK_ROLES === 'true') {
    return res.reportError('InputError',
      'Roles are temporarily locked during upgrade',
      {});
  }

  // Load role
  let callerScopes = await req.scopes();
  let reportError = (code, message, details) => {
    res.reportError(code, message, details);
    let err = new Error();
    err.code = 'ErrorReported';
    return err;
  };
  try {
    await this.Roles.modify(async (roles) => {
      let i = _.findIndex(roles, {roleId});
      if (i === -1) {
        throw reportError('ResourceNotFound', 'Role not found', {});
      }
      role = roles[i];

      // Check scopes
      const formerRoleScopes = this.resolver.resolve(role.scopes);
      const scopesAdded = input.scopes.filter(s => !scopeUtils.scopeMatch(formerRoleScopes, [[s]]));
      await req.authorize({roleId, scopesAdded});

      // check that this updated role does not introduce a cycle, careful not to modify
      // the original yet (since azure-blob-storage caches it)
      let checkRoles = _.clone(roles);
      checkRoles[i] = _.clone(role);
      checkRoles[i].scopes = input.scopes;
      try {
        ScopeResolver.cycleCheck(checkRoles);
      } catch (e) {
        throw reportError('InputError', `Invalid roles: ${e.message}`, {});
      }

      // finish modification
      role.scopes = input.scopes;
      role.description = input.description;
      role.lastModified = new Date().toJSON();
    });
  } catch (e) {
    if (e.code === 'ErrorReported') {
      // res.reportError already called
      return;
    }
    throw e;
  }

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.roleUpdated({roleId}),
    this.resolver.reloadRoles(),
  ]);

  return res.reply(roleToJson(role, this));
});

/** Delete role */
api.declare({
  method:     'delete',
  route:      '/roles/:roleId',
  name:       'deleteRole',
  scopes:     'auth:delete-role:<roleId>',
  stability:  'stable',
  title:      'Delete Role',
  description: [
    'Delete a role. This operation will succeed regardless of whether or not',
    'the role exists.',
  ].join('\n'),
}, async function(req, res) {
  let roleId  = req.params.roleId;

  if (process.env.LOCK_ROLES === 'true') {
    return res.reportError('InputError',
      'Roles are temporarily locked during upgrade',
      {});
  }

  // Check scopes
  await req.authorize({roleId});

  await this.Roles.modify(roles => {
    let i = _.findIndex(roles, {roleId});
    if (i !== -1) {
      roles.splice(i, 1);
    }
  });

  await Promise.all([
    this.publisher.roleDeleted({roleId}),
    this.resolver.reloadRoles(),
  ]);

  return res.status(204).send();
});

/** Expand a scopeset */
api.declare({
  method:     'get',
  route:      '/scopes/expand',
  name:       'expandScopesGet',
  input:      'scopeset.json#',
  output:     'scopeset.json#',
  stability:  'deprecated',
  title:      'Expand Scopes',
  description: [
    'Return an expanded copy of the given scopeset, with scopes implied by any',
    'roles included.',
    '',
    'This call uses the GET method with an HTTP body.  It remains only for',
    'backward compatibility.',
  ].join('\n'),
}, async function(req, res) {
  let input = req.body;
  return res.reply({scopes: this.resolver.resolve(input.scopes)});
});

api.declare({
  method:     'post',
  route:      '/scopes/expand',
  name:       'expandScopes',
  input:      'scopeset.json#',
  output:     'scopeset.json#',
  stability:  'stable',
  title:      'Expand Scopes',
  description: [
    'Return an expanded copy of the given scopeset, with scopes implied by any',
    'roles included.',
  ].join('\n'),
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
  title:      'Get Current Scopes',
  description: [
    'Return the expanded scopes available in the request, taking into account all sources',
    'of scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,',
    'and roles).',
  ].join('\n'),
}, async function(req, res) {
  let input = req.body;
  return res.reply({scopes: await req.scopes()});
});

// Load aws and azure API implementations, these loads API and declares methods
// on the API object exported from this file
require('./aws');
require('./azure');
require('./sentry');
require('./statsum');
require('./webhooktunnel');

/** Get all client information */
api.declare({
  method:     'post',
  route:      '/authenticate-hawk',
  name:       'authenticateHawk',
  input:      'authenticate-hawk-request.json#',
  output:     'authenticate-hawk-response.json#',
  stability:  'stable',
  title:      'Authenticate Hawk Request',
  description: [
    'Validate the request signature given on input and return list of scopes',
    'that the authenticating client has.',
    '',
    'This method is used by other services that wish rely on Taskcluster',
    'credentials for authentication. This way we can use Hawk without having',
    'the secret credentials leave this service.',
  ].join('\n'),
}, function(req, res) {
  return this.signatureValidator(req.body).then(result => {
    if (result.expires) {
      result.expires = result.expires.toJSON();
    }
    return res.reply(result);
  });
});

api.declare({
  method:     'post',
  route:      '/test-authenticate',
  name:       'testAuthenticate',
  input:      'test-authenticate-request.json#',
  output:     'test-authenticate-response.json#',
  stability:  'stable',
  title:      'Test Authentication',
  description: [
    'Utility method to test client implementations of Taskcluster',
    'authentication.',
    '',
    'Rather than using real credentials, this endpoint accepts requests with',
    'clientId `tester` and accessToken `no-secret`. That client\'s scopes are',
    'based on `clientScopes` in the request body.',
    '',
    'The request is validated, with any certificate, authorizedScopes, etc.',
    'applied, and the resulting scopes are checked against `requiredScopes`',
    'from the request body. On success, the response contains the clientId',
    'and scopes as seen by the API method.',
  ].join('\n'),
}, async function(req, res) {
  await new Promise(next => API.remoteAuthentication({
    signatureValidator: signaturevalidator.createSignatureValidator({
      clientLoader: async (clientId) => {
        if (clientId !== 'tester') {
          throw new Error('Client with clientId \'' + clientId + '\' not found');
        }
        return {
          clientId: 'tester',
          accessToken: 'no-secret',
          scopes: req.body.clientScopes,
        };
      },
      monitor: this.monitor,
    }),
  }, {
    route: '/test-authenticate',
    scopes: {AllOf: [
      {for: 'scope', in: 'requiredScopes', each: '<scope>'},
    ]},
  })(req, res, next));
  await req.authorize({requiredScopes: req.body.requiredScopes || []});
  const [clientId, scopes] = await Promise.all([
    req.clientId(),
    req.scopes(),
  ]);
  res.reply({clientId, scopes});
});

api.declare({
  method:     'get',
  route:      '/test-authenticate-get/',
  name:       'testAuthenticateGet',
  output:     'test-authenticate-response.json#',
  stability:  'stable',
  title:      'Test Authentication (GET)',
  description: [
    'Utility method similar to `testAuthenticate`, but with the GET method,',
    'so it can be used with signed URLs (bewits).',
    '',
    'Rather than using real credentials, this endpoint accepts requests with',
    'clientId `tester` and accessToken `no-secret`. That client\'s scopes are',
    '`[\'test:*\', \'auth:create-client:test:*\']`.  The call fails if the ',
    '`test:authenticate-get` scope is not available.',
    '',
    'The request is validated, with any certificate, authorizedScopes, etc.',
    'applied, and the resulting scopes are checked, just like any API call.',
    'On success, the response contains the clientId and scopes as seen by',
    'the API method.',
    '',
    'This method may later be extended to allow specification of client and',
    'required scopes via query arguments.',
  ].join('\n'),
}, async function(req, res) {
  await new Promise(next => API.remoteAuthentication({
    signatureValidator: signaturevalidator.createSignatureValidator({
      clientLoader: async (clientId) => {
        if (clientId !== 'tester') {
          throw new Error('Client with clientId \'' + clientId + '\' not found');
        }
        return {
          clientId: 'tester',
          accessToken: 'no-secret',
          scopes: ['test:*', 'auth:create-client:test:*'],
        };
      },
      monitor: this.monitor,
    }),
  }, {
    route: '/test-authenticate',
    scopes: {AllOf: [
      {for: 'scope', in: 'requiredScopes', each: '<scope>'},
    ]},
  })(req, res, next));
  await req.authorize({requiredScopes: ['test:authenticate-get']});
  const [clientId, scopes] = await Promise.all([
    req.clientId(),
    req.scopes(),
  ]);
  res.reply({clientId, scopes});
});
