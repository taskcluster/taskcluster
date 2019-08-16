const APIBuilder = require('taskcluster-lib-api');
const scopeUtils = require('taskcluster-lib-scopes');
const slugid = require('slugid');
const _ = require('lodash');
const signaturevalidator = require('./signaturevalidator');
const ScopeResolver = require('./scoperesolver');
const Hashids = require('hashids');

/**
 * Helper to return a role as defined in the blob to one suitable for return.
 * This involves adding expandedRoles using the resolver.
 */
const roleToJson = (role, context) => _.defaults(
  {expandedScopes: context.resolver.resolve([`assume:${role.roleId}`])},
  role
);

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
  let roles = await that.Roles.get();
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
  title: 'Authentication API',
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

    // The websocktunnel config (with property `secret`)
    'websocktunnel',

    // An object containing {googleapis, auth, credentials} for interacting
    // with GCP.
    'gcp',
  ],
});

// Export API
module.exports = builder;

/** List clients */
builder.declare({
  method: 'get',
  route: '/clients/',
  query: {
    prefix: /^[A-Za-z0-9!@/:.+|_-]+$/, // should match clientId above
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listClients',
  output: 'list-clients-response.yml',
  category: 'Auth Service',
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
  let prefix = req.query.prefix;
  let limit = parseInt(req.query.limit || 1000, 10);
  let Client = this.Client;
  let resolver = this.resolver;

  let response = {clients: []};

  let opts = {limit};
  if (req.query.continuationToken) {
    opts.continuation = req.query.continuationToken;
  }
  let data = await Client.scan({}, opts);
  data.entries.forEach(client => {
    if (!prefix || client.clientId.startsWith(prefix)) {
      response.clients.push(client.json(resolver));
    }
  });
  if (data.continuation) {
    response.continuationToken = data.continuation;
  }

  res.reply(response);
});

/** Get client */
builder.declare({
  method: 'get',
  route: '/clients/:clientId',
  name: 'client',
  stability: 'stable',
  category: 'Auth Service',
  output: 'get-client-response.yml',
  title: 'Get Client',
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
/** Reset access token for client */
/** Update client */
/** Enable client */
/** Disable client */
/** Delete client */
/** List roles */
builder.declare({
  method: 'get',
  route: '/roles/',
  name: 'listRoles',
  input: undefined,
  output: 'list-roles-response.yml',
  category: 'Auth Service',
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
  let roles = await this.Roles.get();
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
  input: undefined,
  category: 'Auth Service',
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
  input: undefined,
  category: 'Auth Service',
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
  let roleIds = roles.map(r => r.roleId);

  response.roleIds = roleIds;

  res.reply(response);
});

/** Get role */
builder.declare({
  method: 'get',
  route: '/roles/:roleId',
  name: 'role',
  input: undefined,
  category: 'Auth Service',
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
  let roles = await this.Roles.get();
  let role = _.find(roles, {roleId});

  if (!role) {
    return res.reportError('ResourceNotFound', 'Role not found', {});
  }

  res.reply(roleToJson(role, this));
});

/** Create role */
/** Update role */
/** Delete role */
/** Expand a scopeset */
builder.declare({
  method: 'post',
  route: '/scopes/expand',
  name: 'expandScopes',
  input: 'scopeset.yml',
  output: 'scopeset.yml',
  category: 'Auth Service',
  stability: 'stable',
  title: 'Expand Scopes',
  description: [
    'Return an expanded copy of the given scopeset, with scopes implied by any',
    'roles included.',
  ].join('\n'),
}, async function(req, res) {
  let input = req.body;
  return res.reply({scopes: this.resolver.resolve(input.scopes)});
});

/** Get the request scopes */
builder.declare({
  method: 'get',
  route: '/scopes/current',
  name: 'currentScopes',
  output: 'scopeset.yml',
  category: 'Auth Service',
  stability: 'stable',
  title: 'Get Current Scopes',
  description: [
    'Return the expanded scopes available in the request, taking into account all sources',
    'of scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,',
    'and roles).',
  ].join('\n'),
}, async function(req, res) {
  return res.reply({scopes: await req.scopes()});
});

// Load aws and azure API implementations, these loads API and declares methods
// on the API object exported from this file
require('./aws');
require('./azure');
require('./sentry');
require('./statsum');
require('./websocktunnel');
require('./gcp');

/** Get all client information */
builder.declare({
  method: 'post',
  route: '/authenticate-hawk',
  name: 'authenticateHawk',
  input: 'authenticate-hawk-request.yml',
  category: 'Auth Service',
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
  category: 'Auth Service',
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
    entry: {
      route: '/test-authenticate',
      scopes: {AllOf: [
        {for: 'scope', in: 'requiredScopes', each: '<scope>'},
      ]},
    },
  })(req, res, next));
  await req.authorize({requiredScopes: req.body.requiredScopes || []});
  const [clientId, scopes] = await Promise.all([
    req.clientId(),
    req.scopes(),
  ]);
  res.reply({clientId, scopes});
});

builder.declare({
  method: 'get',
  route: '/test-authenticate-get/',
  name: 'testAuthenticateGet',
  category: 'Auth Service',
  output: 'test-authenticate-response.yml',
  stability: 'stable',
  title: 'Test Authentication (GET)',
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
  await new Promise(next => APIBuilder.middleware.remoteAuthentication({
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
    entry: {
      route: '/test-authenticate',
      scopes: {AllOf: [
        {for: 'scope', in: 'requiredScopes', each: '<scope>'},
      ]},
    },
  })(req, res, next));
  await req.authorize({requiredScopes: ['test:authenticate-get']});
  const [clientId, scopes] = await Promise.all([
    req.clientId(),
    req.scopes(),
  ]);
  res.reply({clientId, scopes});
});
