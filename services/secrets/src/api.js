const APIBuilder = require('taskcluster-lib-api');
const Entity = require('azure-entities');

/** API end-point for version v1/
 *
 */
let builder = new APIBuilder({
  title: 'Taskcluster Secrets API Documentation',
  description: [
    'The secrets service provides a simple key/value store for small bits of secret',
    'data.  Access is limited by scopes, so values can be considered secret from',
    'those who do not have the relevant scopes.',
    '',
    'Secrets also have an expiration date, and once a secret has expired it can no',
    'longer be read.  This is useful for short-term secrets such as a temporary',
    'service credential or a one-time signing key.',
  ].join('\n'),
  serviceName: 'secrets',
  apiVersion: 'v1',
  context: ['cfg', 'db'],
});

// Export API
module.exports = builder;

let cleanPayload = payload => {
  payload.secret = '(OMITTED)';
  return payload;
};

builder.declare({
  method: 'put',
  route: '/secret/:name(*)',
  name: 'set',
  input: 'secret.yml',
  scopes: 'secrets:set:<name>',
  title: 'Set Secret',
  stability: 'stable',
  category: 'Secrets Service',
  cleanPayload,
  description: [
    'Set the secret associated with some key.  If the secret already exists, it is',
    'updated instead.',
  ].join('\n'),
}, async function(req, res) {
  let {name} = req.params;
  let {secret, expires} = req.body;
  await this.db.procs.set_secret_with_expires(name, JSON.stringify(secret), new Date(expires));
  res.reply({});
});

builder.declare({
  method: 'delete',
  route: '/secret/:name(*)',
  name: 'remove',
  scopes: 'secrets:set:<name>',
  title: 'Delete Secret',
  stability: 'stable',
  category: 'Secrets Service',
  description: [
    'Delete the secret associated with some key.',
  ].join('\n'),
}, async function(req, res) {
  let {name} = req.params;

  // we have historically returned 404 for nonexistent secrets
  const rows = await this.db.procs.get_secret(name);
  if (rows.length === 0) {
    return res.reportError('ResourceNotFound', 'Secret not found', {});
  }

  await this.db.procs.remove_secret(name);

  res.reply({});
});

builder.declare({
  method: 'get',
  route: '/secret/:name(*)',
  name: 'get',
  output: 'secret.yml',
  scopes: 'secrets:get:<name>',
  title: 'Read Secret',
  stability: 'stable',
  category: 'Secrets Service',
  description: [
    'Read the secret associated with some key.  If the secret has recently',
    'expired, the response code 410 is returned.  If the caller lacks the',
    'scope necessary to get the secret, the call will fail with a 403 code',
    'regardless of whether the secret exists.',
  ].join('\n'),
}, async function(req, res) {
  let {name} = req.params;
  const rows = await this.db.procs.get_secret_with_expires(name);
  if (rows.length === 0) {
    return res.reportError('ResourceNotFound', 'Secret not found', {});
  }
  const row = rows[0];
  if (row.expires < new Date()) {
    return res.reportError('ResourceExpired', 'The requested resource has expired.', {});
  }
  res.reply({
    secret: JSON.parse(row.secret),
    expires: row.expires.toJSON(),
  });
});

builder.declare({
  method: 'get',
  route: '/secrets',
  name: 'list',
  output: 'secret-list.yml',
  title: 'List Secrets',
  stability: 'stable',
  category: 'Secrets Service',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  description: [
    'List the names of all secrets.',
    '',
    'By default this end-point will try to return up to 1000 secret names in one',
    'request. But it **may return less**, even if more tasks are available.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `listTaskGroup` with the last `continuationToken` until you',
    'get a result without a `continuationToken`.',
    '',
    'If you are not interested in listing all the members at once, you may',
    'use the query-string option `limit` to return fewer.',
  ].join('\n'),
}, async function(req, res) {
  // TODO: continuationToken / limit
  const secrets = await this.db.procs.list_secrets_with_expires();

  return res.reply({
    secrets: secrets.map(secret => secret.name),
  });
});
