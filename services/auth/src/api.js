import { APIBuilder, paginateResults } from 'taskcluster-lib-api';
import scopeUtils from 'taskcluster-lib-scopes';
import { UNIQUE_VIOLATION } from 'taskcluster-lib-postgres';
import slugid from 'slugid';
import _ from 'lodash';
import createSignatureValidator from './signaturevalidator.js';
import ScopeResolver from './scoperesolver.js';
import Hashids from 'hashids';
import { modifyRoles } from '../src/data.js';
import { awsBuilder } from './aws.js';
import { gcpBuilder } from './gcp.js';
import { azureBuilder } from './azure.js';
import { sentryBuilder } from './sentry.js';
import { websocktunnelBuilder } from './websocktunnel.js';

/**
 * Helper to return a role as defined in the blob to one suitable for return.
 * This involves adding expandedRoles using the resolver.
 */
const roleToJson = ({ role_id, scopes, description, last_modified, created }, context) => ({
  roleId: role_id,
  scopes,
  expandedScopes: context.resolver.resolve([`assume:${role_id}`]),
  description,
  lastModified: last_modified.toJSON(),
  created: created.toJSON(),
});

/**
 * Helper to return a client from the API.  Note that this does not include the
 * access token, but does resolve expandedScopes.
 */
const clientToJson = (client, context) => ({
  clientId: client.client_id,
  description: client.description,
  expires: client.expires.toJSON(),
  created: client.created.toJSON(),
  lastModified: client.last_modified.toJSON(),
  lastDateUsed: client.last_date_used.toJSON(),
  lastRotated: client.last_rotated.toJSON(),
  deleteOnExpiration: client.delete_on_expiration,
  scopes: client.scopes,
  expandedScopes: context.resolver.resolve(client.scopes),
  disabled: client.disabled,
});

/**
 * Helper to fetch roles
 * This involves building response for pagination
 */
const rolesResponseBuilder = async (that, req, res) => {
  let hashids = new Hashids();
  let continuationToken;
  let limit = parseInt(req.query.limit, 10) || undefined;
  let response = {};

  // Assign the continuationToken
  if (req.query.continuationToken) {
    continuationToken = hashids.decode(req.query.continuationToken);
    // If continuationToken is invalid
    if (continuationToken.length === 0) {
      return res.reportError('InputError', 'Invalid continuationToken', {});
    }
    // Assign the decoded token value
    continuationToken = continuationToken[0];
  } else {
    continuationToken = undefined;
  }

  // Load all roles
  let roles = await that.db.fns.get_roles();

  let length = roles.length;

  // Slice the list of roles based on continuationToken and limit
  if (continuationToken && limit) {
    roles = roles.slice(continuationToken, limit + continuationToken);
    continuationToken = limit + continuationToken;

    if (continuationToken < length) {
      response.continuationToken = hashids.encode(continuationToken, 10);
    }
  } else if (limit) {
    roles = roles.slice(0, limit); // If no continuationToken is provided
    continuationToken = limit;

    if (continuationToken < length) {
      response.continuationToken = hashids.encode(continuationToken, 10);
    }
  }

  return { response, roles };
};

/** API end-point for version v1/ */
const builder = new APIBuilder({
  title: 'Auth Service',
  serviceName: 'auth',
  apiVersion: 'v1',
  description: [
    'Authentication related API end-points for Taskcluster and related',
    'services. These API end-points are of interest if you wish to:',
    '  * Authorize a request signed with Taskcluster credentials,',
    '  * Manage clients and roles,',
    '  * Inspect or audit clients and roles,',
    '  * Gain access to various services guarded by this API.',
    '',
  ].join('\n'),
  params: {
    // Patterns for auth
    clientId: /^[A-Za-z0-9!@/:.+|_-]+$/, // should match schemas/constants.yml, prefix below
    roleId: /^[\x20-\x7e]+$/,

    // Patterns for Azure
    account: /^[a-z0-9]{3,24}$/,
    table: /^[A-Za-z][A-Za-z0-9]{2,62}$/,
    container: /^(?!.*[-]{2})[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
    level: /^(read-write|read-only)$/,

    // Patterns for AWS
    bucket: /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/,
    // we could allow "." too, but S3 buckets with dot in the name
    // doesn't work well with HTTPS and virtual-style hosting.
    // Hence, we shouldn't encourage people to use them
    // Project for sentry (and other per project resources)
    project: /^[a-zA-Z0-9_-]{1,64}$/,
  },
  context: [
    // Database
    'db',

    // Publisher from exchanges.js
    'publisher',

    // ScopeResolver instance
    'resolver',

    // Signature validator
    'signatureValidator',

    // SentryManager from sentrymanager.js
    'sentryManager',

    // The websocktunnel config (with property `secret`)
    'websocktunnel',

    // the loaded config
    'cfg',

    // An object containing {googleapis, auth, credentials} for interacting
    // with GCP.
    'gcp',
  ],
});

// Export API
export default builder;

/** List clients */
builder.declare({
  method: 'get',
  route: '/clients/',
  query: {
    prefix: /^[A-Za-z0-9!@/:.+|_-]+$/, // should match clientId above
    ...paginateResults.query,
  },
  name: 'listClients',
  scopes: 'auth:list-clients',
  output: 'list-clients-response.yml',
  category: 'Clients',
  stability: 'stable',
  title: 'List Clients',
  description: [
    'Get a list of all clients.  With `prefix`, only clients for which',
    'it is a prefix of the clientId are returned.',
    '',
    'By default this end-point will try to return up to 1000 clients in one',
    'request. But it **may return less, even none**.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `listClients` with the last `continuationToken` until you',
    'get a result without a `continuationToken`.',
  ].join('\n'),
}, async function(req, res) {
  const { continuationToken, rows } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_clients(req.query.prefix, size, offset),
    maxLimit: 1000,
  });

  res.reply({ clients: rows.map(c => clientToJson(c, this)), continuationToken });
});

/** Get client */
builder.declare({
  method: 'get',
  route: '/clients/:clientId',
  name: 'client',
  scopes: 'auth:get-client:<clientId>',
  stability: 'stable',
  category: 'Clients',
  output: 'get-client-response.yml',
  title: 'Get Client',
  description: [
    'Get information about a single client.',
  ].join('\n'),
}, async function(req, res) {
  let [client] = await this.db.fns.get_client(req.params.clientId);
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  res.reply(clientToJson(client, this));
});

/** Create client */
builder.declare({
  method: 'put',
  route: '/clients/:clientId',
  name: 'createClient',
  category: 'Clients',
  input: 'create-client-request.yml',
  output: 'create-client-response.yml',
  scopes: {
    AllOf: [
      'auth:create-client:<clientId>',
      { for: 'scope', in: 'scopes', each: '<scope>' },
    ],
  },
  stability: 'stable',
  title: 'Create Client',
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
  let clientId = req.params.clientId;
  let input = req.body;
  let scopes = input.scopes || [];

  // Forbid changes to static clients
  if (clientId.startsWith('static/')) {
    return res.reportError('InputError',
      'clientId "{{clientId}}" starts with "static/" which is reserved for statically ' +
      'configured clients. Contact your administrator to change static clients.',
      { clientId },
    );
  }

  if (scopes.some(s => s.endsWith('**'))) {
    return res.reportError('InputError', 'scopes must not end with `**`', {});
  }

  // Check scopes
  await req.authorize({ clientId, scopes });

  let accessToken = slugid.v4() + slugid.v4();

  try {
    await this.db.fns.create_client(
      clientId,
      input.description,
      this.db.encrypt({ value: Buffer.from(accessToken, 'utf8') }),
      new Date(input.expires),
      false,
      JSON.stringify(scopes),
      !!input.deleteOnExpiration,
    );
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    return res.reportError('RequestConflict', 'Client already exists', {});
  }

  // Send pulse message
  await Promise.all([
    this.publisher.clientCreated({ clientId }),
    this.resolver.reloadClient(clientId),
  ]);

  // Create result with access token
  let [client] = await this.db.fns.get_client(clientId);
  let result = clientToJson(client, this);
  result.accessToken = this.db.decrypt({ value: client.encrypted_access_token }).toString('utf8');
  return res.reply(result);
});

/** Reset access token for client */
builder.declare({
  method: 'post',
  route: '/clients/:clientId/reset',
  name: 'resetAccessToken',
  category: 'Clients',
  output: 'create-client-response.yml',
  scopes: 'auth:reset-access-token:<clientId>',
  stability: 'stable',
  title: 'Reset `accessToken`',
  description: [
    'Reset a clients `accessToken`, this will revoke the existing',
    '`accessToken`, generate a new `accessToken` and return it from this',
    'call.',
    '',
    'There is no way to retrieve an existing `accessToken`, so if you loose it',
    'you must reset the accessToken to acquire it again.',
  ].join('\n'),
}, async function(req, res) {
  let clientId = req.params.clientId;

  // Forbid changes to static clients
  if (clientId.startsWith('static/')) {
    return res.reportError('InputError',
      'clientId "{{clientId}}" starts with "static/" which is reserved for statically ' +
      'configured clients. Contact your administrator to change static clients.',
      { clientId },
    );
  }

  // Check scopes
  await req.authorize({ clientId });

  // Reset accessToken
  const accessToken = slugid.v4() + slugid.v4();
  const [client] = await this.db.fns.update_client(
    clientId,
    null, // description
    this.db.encrypt({ value: Buffer.from(accessToken, 'utf8') }),
    null, // expires
    null, // disabled
    null, // scopes
    null, // delete_on_expiration
  );
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({ clientId }),
    this.resolver.reloadClient(clientId),
  ]);

  // Create result with access token
  let result = clientToJson(client, this);
  result.accessToken = this.db.decrypt({ value: client.encrypted_access_token }).toString('utf8');
  return res.reply(result);
});

/** Update client */
builder.declare({
  method: 'post',
  route: '/clients/:clientId',
  name: 'updateClient',
  category: 'Clients',
  input: 'create-client-request.yml',
  output: 'get-client-response.yml',
  scopes: {
    AllOf: [
      'auth:update-client:<clientId>',
      { for: 'scope', in: 'scopesAdded', each: '<scope>' },
    ],
  },
  stability: 'stable',
  title: 'Update Client',
  description: [
    'Update an exisiting client. The `clientId` and `accessToken` cannot be',
    'updated, but `scopes` can be modified.  The caller\'s scopes must',
    'satisfy all scopes being added to the client in the update operation.',
    'If no scopes are given in the request, the client\'s scopes remain',
    'unchanged',
  ].join('\n'),
}, async function(req, res) {
  let clientId = req.params.clientId;
  let input = req.body;

  // Forbid changes to static clients
  if (clientId.startsWith('static/')) {
    return res.reportError('InputError',
      'clientId "{{clientId}}" starts with "static/" which is reserved for statically ' +
      'configured clients. Contact your administrator to change static clients.',
      { clientId },
    );
  }

  if (input.scopes && input.scopes.some(s => s.endsWith('**'))) {
    return res.reportError('InputError', 'scopes must not end with `**`', {});
  }

  // Load client
  let [client] = await this.db.fns.get_client(req.params.clientId);
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // the new scopes must be satisfied by the combination of the existing
  // scopes and the caller's scopes
  const scopesAdded = _.difference(input.scopes, client.scopes);

  // Check scopes
  await req.authorize({ clientId, scopesAdded });

  // Update client
  const [updated] = await this.db.fns.update_client(
    clientId,
    input.description,
    null, // encrypted_access_token
    new Date(input.expires),
    null, // disabled
    input.scopes ? JSON.stringify(input.scopes) : null,
    !!input.deleteOnExpiration,
  );
  if (!updated) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({ clientId }),
    this.resolver.reloadClient(clientId),
  ]);

  return res.reply(clientToJson(updated, this));
});

/** Enable client */
builder.declare({
  method: 'post',
  route: '/clients/:clientId/enable',
  name: 'enableClient',
  input: undefined,
  category: 'Clients',
  output: 'get-client-response.yml',
  scopes: 'auth:enable-client:<clientId>',
  stability: 'stable',
  title: 'Enable Client',
  description: [
    'Enable a client that was disabled with `disableClient`.  If the client',
    'is already enabled, this does nothing.',
    '',
    'This is typically used by identity providers to re-enable clients that',
    'had been disabled when the corresponding identity\'s scopes changed.',
  ].join('\n'),
}, async function(req, res) {
  let clientId = req.params.clientId;

  // Forbid changes to static clients
  if (clientId.startsWith('static/')) {
    return res.reportError('InputError',
      'clientId "{{clientId}}" starts with "static/" which is reserved for statically ' +
      'configured clients. Contact your administrator to change static clients.',
      { clientId },
    );
  }

  // Check scopes
  await req.authorize({ clientId });

  // Update client
  const [client] = await this.db.fns.update_client(
    clientId,
    null, // description
    null, // encrypted_access_token
    null, // expires
    false,
    null, // scopes
    null, // delete on expiration
  );
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({ clientId }),
    this.resolver.reloadClient(clientId),
  ]);

  return res.reply(clientToJson(client, this));
});

/** Disable client */
builder.declare({
  method: 'post',
  route: '/clients/:clientId/disable',
  name: 'disableClient',
  input: undefined,
  category: 'Clients',
  output: 'get-client-response.yml',
  scopes: 'auth:disable-client:<clientId>',
  stability: 'stable',
  title: 'Disable Client',
  description: [
    'Disable a client.  If the client is already disabled, this does nothing.',
    '',
    'This is typically used by identity providers to disable clients when the',
    'corresponding identity\'s scopes no longer satisfy the client\'s scopes.',
  ].join('\n'),
}, async function(req, res) {
  let clientId = req.params.clientId;

  // Forbid changes to static clients
  if (clientId.startsWith('static/')) {
    return res.reportError('InputError',
      'clientId "{{clientId}}" starts with "static/" which is reserved for statically ' +
      'configured clients. Contact your administrator to change static clients.',
      { clientId },
    );
  }

  // Check scopes
  await req.authorize({ clientId });

  // Update client
  const [client] = await this.db.fns.update_client(
    clientId,
    null, // description
    null, // encrypted_access_token
    null, // expires
    true,
    null, // scopes
    null, // delete on expiration
  );
  if (!client) {
    return res.reportError('ResourceNotFound', 'Client not found', {});
  }

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.clientUpdated({ clientId }),
    this.resolver.reloadClient(clientId),
  ]);

  return res.reply(clientToJson(client, this));
});

/** Delete client */
builder.declare({
  method: 'delete',
  route: '/clients/:clientId',
  name: 'deleteClient',
  scopes: 'auth:delete-client:<clientId>',
  stability: 'stable',
  category: 'Clients',
  title: 'Delete Client',
  description: [
    'Delete a client, please note that any roles related to this client must',
    'be deleted independently.',
  ].join('\n'),
}, async function(req, res) {
  let clientId = req.params.clientId;

  // Forbid changes to static clients
  if (clientId.startsWith('static/')) {
    return res.reportError('InputError',
      'clientId "{{clientId}}" starts with "static/" which is reserved for statically ' +
      'configured clients. Contact your administrator to change static clients.',
      { clientId },
    );
  }

  // Check scopes
  await req.authorize({ clientId });

  await this.db.fns.delete_client(clientId);

  await Promise.all([
    this.publisher.clientDeleted({ clientId }),
    this.resolver.reloadClient(clientId),
  ]);

  return res.reply();
});

/** List roles */
builder.declare({
  method: 'get',
  route: '/roles/',
  name: 'listRoles',
  scopes: 'auth:list-roles',
  input: undefined,
  output: 'list-roles-response.yml',
  category: 'Roles',
  stability: 'stable',
  title: 'List Roles (no pagination)',
  description: [
    'Get a list of all roles. Each role object also includes the list of',
    'scopes it expands to.  This always returns all roles in a single HTTP',
    'request.',
    '',
    'To get paginated results, use `listRoles2`.',
  ].join('\n'),
}, async function(req, res) {
  // Load all roles
  let roles = await this.db.fns.get_roles();
  res.reply(roles.map(r => roleToJson(r, this)));
});

builder.declare({
  method: 'get',
  route: '/roles2/',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listRoles2',
  scopes: 'auth:list-roles',
  input: undefined,
  category: 'Roles',
  output: 'list-roles2-response.yml',
  stability: 'stable',
  title: 'List Roles',
  description: [
    'Get a list of all roles. Each role object also includes the list of',
    'scopes it expands to.  This is similar to `listRoles` but differs in the',
    'format of the response.',
    '',
    'If no limit is given, all roles are returned. Since this',
    'list may become long, callers can use the `limit` and `continuationToken`',
    'query arguments to page through the responses.',
  ].join('\n'),
}, async function(req, res) {

  // Fetch roles and build response
  const { response, roles } = await rolesResponseBuilder(this, req, res);

  response.roles = roles.map(r => roleToJson(r, this));

  res.reply(response);
});

/** List role Ids **/
builder.declare({
  method: 'get',
  route: '/roleids/',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listRoleIds',
  scopes: 'auth:list-roles',
  input: undefined,
  category: 'Roles',
  output: 'list-role-ids-response.yml',
  stability: 'stable',
  title: 'List Role IDs',
  description: [
    'Get a list of all role IDs.',
    '',
    'If no limit is given, the roleIds of all roles are returned. Since this',
    'list may become long, callers can use the `limit` and `continuationToken`',
    'query arguments to page through the responses.',
  ].join('\n'),
}, async function(req, res) {

  // Fetch roles and build response
  const { response, roles } = await rolesResponseBuilder(this, req, res);

  // Generate a list of roleIds corresponding to the selected roles
  let roleIds = roles.map(r => r.role_id);

  response.roleIds = roleIds;

  res.reply(response);
});

/** Get role */
builder.declare({
  method: 'get',
  route: '/roles/:roleId',
  name: 'role',
  scopes: 'auth:get-role:<roleId>',
  input: undefined,
  category: 'Roles',
  output: 'get-role-response.yml',
  stability: 'stable',
  title: 'Get Role',
  description: [
    'Get information about a single role, including the set of scopes that the',
    'role expands to.',
  ].join('\n'),
}, async function(req, res) {
  let roleId = req.params.roleId;

  // Load role
  let roles = await this.db.fns.get_roles();
  let role = _.find(roles, { role_id: roleId });

  if (!role) {
    return res.reportError('ResourceNotFound', 'Role not found', {});
  }

  res.reply(roleToJson(role, this));
});

/** Create role */
builder.declare({
  method: 'put',
  route: '/roles/:roleId',
  name: 'createRole',
  category: 'Roles',
  input: 'create-role-request.yml',
  output: 'get-role-response.yml',
  scopes: {
    AllOf: [
      'auth:create-role:<roleId>',
      { for: 'scope', in: 'scopes', each: '<scope>' },
    ],
  },
  stability: 'stable',
  title: 'Create Role',
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
  const roleId = req.params.roleId;
  const input = req.body;

  if (input.scopes.some(s => s.endsWith('**'))) {
    return res.reportError('InputError', 'scopes must not end with `**`', {});
  }

  // Check scopes
  await req.authorize({ roleId, scopes: input.scopes });

  input.scopes.sort(scopeUtils.scopeCompare);

  let role = {
    role_id: roleId,
    description: input.description,
    scopes: input.scopes,
    last_modified: new Date(),
    created: new Date(),
  };

  // update Roles
  try {
    await modifyRoles(this.db, ({ roles }) => {
      const existing = _.find(roles, { role_id: roleId });
      if (existing) {
        // role exists and doesn't match this one -> RequestConflict
        if (existing.description !== input.description || !_.isEqual(existing.scopes, input.scopes)) {
          const err = new Error(`Role with roleId '${roleId}' already exists`);
          err.roleId = roleId;
          err.code = 'RoleIdExists';
          throw err;
        }
        role = existing;
      } else {

        // check that this new role does not introduce a cycle
        // Errors from validateRoles will caught higher up
        ScopeResolver.validateRoles([...roles, role]);

        // add the role for real
        roles.push(role);
      }
    });
  } catch (err) {
    switch (err.code) {
      case 'InvalidScopeError':
        return res.reportError('InputError', err.message, { scope: err.scope });
      case 'DependencyCycleError':
        return res.reportError('InputError', err.message, { cycle: err.cycle });
      case 'RoleIdExists':
        return res.reportError('RequestConflict', err.message, { roleId: err.roleId });
      default:
        throw err;
    }
  }

  // Send pulse message and reload
  await Promise.all([
    this.publisher.roleCreated({ roleId }),
    this.resolver.reloadRoles(),
  ]);

  // Send result
  return res.reply(roleToJson(role, this));
});

/** Update role */
builder.declare({
  method: 'post',
  route: '/roles/:roleId',
  name: 'updateRole',
  input: 'create-role-request.yml',
  category: 'Roles',
  output: 'get-role-response.yml',
  scopes: {
    AllOf: [
      'auth:update-role:<roleId>',
      { for: 'scope', in: 'scopesAdded', each: '<scope>' },
    ],
  },
  stability: 'stable',
  title: 'Update Role',
  description: [
    'Update an existing role.',
    '',
    'The caller\'s scopes must satisfy all of the new scopes being added, but',
    'need not satisfy all of the role\'s existing scopes.',
    '',
    'An update of a role that will generate an infinite expansion will result',
    'in an error response.',
  ].join('\n'),
}, async function(req, res) {
  const roleId = req.params.roleId;
  const input = req.body;

  if (input.scopes.some(s => s.endsWith('**'))) {
    return res.reportError('InputError', 'scopes must not end with `**`', {});
  }

  // Load and modify role
  let role;
  try {
    await modifyRoles(this.db, async ({ roles }) => {
      const i = _.findIndex(roles, { role_id: roleId });
      if (i === -1) {
        const err = new Error(`Role with roleId '${roleId}' not found`);
        err.roleId = roleId;
        err.code = 'RoleNotFound';
        throw err;
      }
      role = roles[i];

      // Check scopes
      const formerRoleScopes = this.resolver.resolve(role.scopes);
      const scopesAdded = input.scopes.filter(s => !scopeUtils.satisfiesExpression(formerRoleScopes, s));
      await req.authorize({ roleId, scopesAdded });

      // check that this updated role does not introduce a cycle, careful not to modify
      // the original yet (since azure-blob-storage caches it)
      ScopeResolver.validateRoles([
        ...roles.filter(r => r !== role),
        Object.assign({}, role, { scopes: input.scopes }),
      ]);

      // finish modification
      role.scopes = input.scopes;
      role.description = input.description;
      role.last_modified = new Date();
    });
  } catch (err) {
    switch (err.code) {
      case 'InvalidScopeError':
        return res.reportError('InputError', err.message, { scope: err.scope });
      case 'DependencyCycleError':
        return res.reportError('InputError', err.message, { cycle: err.cycle });
      case 'RoleNotFound':
        return res.reportError('ResourceNotFound', err.message, { roleId: err.roleId });
      default:
        throw err;
    }
  }

  // Publish message on pulse to clear caches...
  await Promise.all([
    this.publisher.roleUpdated({ roleId }),
    this.resolver.reloadRoles(),
  ]);

  return res.reply(roleToJson(role, this));
});

/** Delete role */
builder.declare({
  method: 'delete',
  route: '/roles/:roleId',
  name: 'deleteRole',
  category: 'Roles',
  scopes: 'auth:delete-role:<roleId>',
  stability: 'stable',
  title: 'Delete Role',
  description: [
    'Delete a role. This operation will succeed regardless of whether or not',
    'the role exists.',
  ].join('\n'),
}, async function(req, res) {
  let roleId = req.params.roleId;

  // Check scopes
  await req.authorize({ roleId });

  await modifyRoles(this.db, ({ roles }) => {
    let i = _.findIndex(roles, { role_id: roleId });
    if (i !== -1) {
      roles.splice(i, 1);
    }
  });

  await Promise.all([
    this.publisher.roleDeleted({ roleId }),
    this.resolver.reloadRoles(),
  ]);

  return res.reply();
});

/** Expand a scopeset */
builder.declare({
  method: 'post',
  route: '/scopes/expand',
  name: 'expandScopes',
  scopes: 'auth:expand-scopes',
  input: 'scopeset.yml',
  output: 'scopeset.yml',
  category: 'Scopes and Auth',
  stability: 'stable',
  title: 'Expand Scopes',
  description: [
    'Return an expanded copy of the given scopeset, with scopes implied by any',
    'roles included.',
  ].join('\n'),
}, async function(req, res) {
  let input = req.body;
  return res.reply({ scopes: this.resolver.resolve(input.scopes) });
});

/** Get the request scopes */
builder.declare({
  method: 'get',
  route: '/scopes/current',
  name: 'currentScopes',
  scopes: 'auth:current-scopes',
  output: 'scopeset.yml',
  category: 'Scopes and Auth',
  stability: 'stable',
  title: 'Get Current Scopes',
  description: [
    'Return the expanded scopes available in the request, taking into account all sources',
    'of scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,',
    'and roles).',
  ].join('\n'),
}, async function(req, res) {
  return res.reply({ scopes: await req.scopes() });
});

// Load aws and azure API implementations, these loads API and declares methods
// on the API object exported from this file
awsBuilder(builder);
azureBuilder(builder);
sentryBuilder(builder);
websocktunnelBuilder(builder);
gcpBuilder(builder);

/** Get all client information */
builder.declare({
  method: 'post',
  route: '/authenticate-hawk',
  name: 'authenticateHawk',
  input: 'authenticate-hawk-request.yml',
  category: 'Scopes and Auth',
  output: 'authenticate-hawk-response.yml',
  stability: 'stable',
  title: 'Authenticate Hawk Request',
  description: [
    'Validate the request signature given on input and return list of scopes',
    'that the authenticating client has.',
    '',
    'This method is used by other services that wish rely on Taskcluster',
    'credentials for authentication. This way we can use Hawk without having',
    'the secret credentials leave this service.',
  ].join('\n'),
  // This API method should _not_ require scopes, since auth middleware calls
  // it without authentication. If later the auth middleware uses credentials
  // a scope could be added here.
  scopes: null,
}, function(req, res) {
  return this.signatureValidator(req.body).then(result => {
    if (result.expires) {
      result.expires = result.expires.toJSON();
    }
    return res.reply(result);
  });
});

builder.declare({
  method: 'post',
  route: '/test-authenticate',
  name: 'testAuthenticate',
  // scopes here would not make sense since this endpoint is called with a fake client
  scopes: null,
  category: 'Scopes and Auth',
  input: 'test-authenticate-request.yml',
  output: 'test-authenticate-response.yml',
  stability: 'stable',
  title: 'Test Authentication',
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
  await new Promise(next => APIBuilder.middleware.remoteAuthentication({
    signatureValidator: createSignatureValidator({
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
    entry: {
      route: '/test-authenticate',
      scopes: { AllOf: [
        { for: 'scope', in: 'requiredScopes', each: '<scope>' },
      ] },
    },
  })(req, res, next));
  await req.authorize({ requiredScopes: req.body.requiredScopes || [] });
  const [clientId, scopes] = await Promise.all([
    req.clientId(),
    req.scopes(),
  ]);
  res.reply({ clientId, scopes });
});

builder.declare({
  method: 'get',
  route: '/test-authenticate-get/',
  name: 'testAuthenticateGet',
  // scopes here would not make sense since this endpoint is called with a fake client
  scopes: null,
  category: 'Scopes and Auth',
  output: 'test-authenticate-response.yml',
  stability: 'stable',
  title: 'Test Authentication (GET)',
  description: [
    'Utility method similar to `testAuthenticate`, but with the GET method,',
    'so it can be used with signed URLs (bewits).',
    '',
    'Rather than using real credentials, this endpoint accepts requests with',
    'clientId `tester` and accessToken `no-secret`. That client\'s scopes are',
    '`[\'test:*\', \'auth:create-client:test:*\']`.  The call fails if the',
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
  await new Promise(next => APIBuilder.middleware.remoteAuthentication({
    signatureValidator: createSignatureValidator({
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
    entry: {
      route: '/test-authenticate',
      scopes: { AllOf: [
        { for: 'scope', in: 'requiredScopes', each: '<scope>' },
      ] },
    },
  })(req, res, next));
  await req.authorize({ requiredScopes: ['test:authenticate-get'] });
  const [clientId, scopes] = await Promise.all([
    req.clientId(),
    req.scopes(),
  ]);
  res.reply({ clientId, scopes });
});

builder.declare({
  method: 'get',
  route: '/__heartbeat__',
  name: 'heartbeat',
  scopes: null,
  category: 'Monitoring',
  stability: 'stable',
  title: 'Heartbeat',
  description: [
    'Respond with a service heartbeat.',
    '',
    'This endpoint is used to check on backing services this service',
    'depends on.',
  ].join('\n'),
}, function(_req, res) {
  // TODO: add implementation
  res.reply({});
});
